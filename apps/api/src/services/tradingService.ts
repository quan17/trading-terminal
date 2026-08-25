import type {
  Account,
  AccountSnapshot,
  AssetBalance,
  Market,
  MarketSymbol,
  Order,
  OrderBookSnapshot,
  OrderSide,
  Position,
  Trade,
  WsServerEvent
} from "@reya/shared";
import type { CreateOrderInput } from "@reya/shared";
import { DEMO_ACCOUNT_ID } from "../market/defaults";
import type { MarketSimulator } from "../market/simulator";
import type { RealtimeHub } from "./realtimeHub";
import type { TradingRepository } from "../repositories/types";

const FEE_RATE = 0.0004;
const STARTING_EQUITY = 100_000;
const EPSILON = 0.00000001;

export class TradingService {
  private readonly matchingSymbols = new Set<MarketSymbol>();

  constructor(
    private readonly repository: TradingRepository,
    private readonly marketSimulator: MarketSimulator,
    private readonly realtimeHub: RealtimeHub
  ) {}

  async getAccountSnapshot(): Promise<AccountSnapshot> {
    const account = await this.repository.getAccount();
    const markets = await this.repository.listMarkets();
    const orders = await this.repository.listOrders(100);
    const trades = await this.repository.listTrades(100);
    const positions = await this.getMarkedPositions();
    const openOrders = await this.repository.listOpenOrders();
    const positionNotional = positions.reduce((sum, position) => sum + position.notional, 0);
    const equity = roundMoney(account.cashBalance + positionNotional);
    const balances = this.calculateBalances(account, markets, positions, openOrders);
    const usdBalance = balances.find((balance) => balance.asset === "USD");
    const realizedPnl = roundMoney(positions.reduce((sum, position) => sum + position.realizedPnl, 0));
    const unrealizedPnl = roundMoney(positions.reduce((sum, position) => sum + position.unrealizedPnl, 0));
    const feesPaid = roundMoney(trades.reduce((sum, trade) => sum + (trade.fee ?? 0), 0));
    const totalPnl = roundMoney(equity - STARTING_EQUITY);

    return {
      account: {
        ...account,
        equity,
        buyingPower: usdBalance?.available ?? 0
      },
      portfolio: {
        startingEquity: STARTING_EQUITY,
        equity,
        totalPnl,
        totalPnlPercent: roundMoney((totalPnl / STARTING_EQUITY) * 100),
        realizedPnl,
        unrealizedPnl,
        feesPaid
      },
      balances,
      positions,
      orders,
      trades
    };
  }

  async placeOrder(input: CreateOrderInput): Promise<OrderExecutionResult> {
    const market = await this.repository.getMarket(input.symbol);
    if (!market) {
      throw new Error(`Unknown market: ${input.symbol}`);
    }

    const immediateExecutionPlan = this.getImmediateExecutionPlan(input.symbol, input.side, input.type, input.quantity, input.price);
    const clientOrderId = input.clientOrderId ?? `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    if (input.quantity < market.minOrderSize) {
      return this.rejectOrder(input, market, clientOrderId, `Minimum order size is ${market.minOrderSize} ${market.baseAsset}.`);
    }

    const spotRejectionReason = await this.getSpotOrderRejectionReason(market, input, immediateExecutionPlan?.price);
    if (spotRejectionReason) {
      return this.rejectOrder(input, market, clientOrderId, spotRejectionReason);
    }

    const order = await this.repository.createOrder({
      clientOrderId,
      accountId: DEMO_ACCOUNT_ID,
      marketId: market.id,
      symbol: market.symbol,
      side: input.side,
      type: input.type,
      status: "OPEN",
      price: input.type === "LIMIT" ? input.price ?? null : null,
      quantity: input.quantity,
      filledQuantity: 0,
      avgFillPrice: null
    });
    this.realtimeHub.broadcast({ type: "order.created", data: order });

    if (!immediateExecutionPlan) {
      const account = await this.broadcastAccount();
      return { order, account };
    }

    return this.executeOpenOrder(order, immediateExecutionPlan);
  }

  async matchOpenOrdersForBook(orderBook: OrderBookSnapshot): Promise<OrderExecutionResult[]> {
    if (this.matchingSymbols.has(orderBook.symbol)) {
      return [];
    }

    this.matchingSymbols.add(orderBook.symbol);
    try {
      const openOrders = await this.repository.listOpenOrders(orderBook.symbol);
      const executions: OrderExecutionResult[] = [];

      for (const order of openOrders) {
        const executionPlan = getCrossingExecutionPlan(order, orderBook);
        if (!executionPlan) {
          continue;
        }

        const currentOrder = await this.repository.getOrder(order.id);
        const currentExecutionPlan = currentOrder ? getCrossingExecutionPlan(currentOrder, orderBook) : undefined;
        if (!currentOrder || currentOrder.status !== "OPEN" || !currentExecutionPlan) {
          continue;
        }

        executions.push(await this.executeOpenOrder(currentOrder, currentExecutionPlan));
      }

      return executions;
    } finally {
      this.matchingSymbols.delete(orderBook.symbol);
    }
  }

  private async executeOpenOrder(order: Order, execution: ExecutionPlan): Promise<OrderExecutionResult> {
    const executionPrice = execution.price;
    const fillQuantity = roundQuantity(Math.min(remainingQuantity(order), execution.quantity));
    if (fillQuantity <= 0) {
      return { order, account: await this.getAccountSnapshot() };
    }

    const account = await this.repository.getAccount();
    const notional = executionPrice * fillQuantity;
    const fee = notional * FEE_RATE;
    const cashDelta = order.side === "BUY" ? -(notional + fee) : notional - fee;
    const spotRejectionReason = await this.getSpotFillRejectionReason(order, executionPrice, fillQuantity);

    if (spotRejectionReason || (order.side === "BUY" && account.cashBalance + cashDelta < -EPSILON)) {
      const rejected = await this.repository.updateOrder(order.id, {
        status: "REJECTED",
        rejectReason: spotRejectionReason ?? "Insufficient available USD."
      });
      this.realtimeHub.broadcast({ type: "order.updated", data: rejected });
      return { order: rejected, account: await this.broadcastAccount() };
    }

    const nextFilledQuantity = roundQuantity(order.filledQuantity + fillQuantity);
    const nextStatus = isGreaterThan(order.quantity, nextFilledQuantity) ? "OPEN" : "FILLED";
    const avgFillPrice = calculateAverageFillPrice(order, executionPrice, fillQuantity);
    const updatedOrder = await this.repository.updateOrder(order.id, {
      status: nextStatus,
      filledQuantity: nextStatus === "FILLED" ? order.quantity : nextFilledQuantity,
      avgFillPrice,
      rejectReason: null
    });

    const trade = await this.repository.createTrade({
      orderId: updatedOrder.id,
      accountId: DEMO_ACCOUNT_ID,
      marketId: order.marketId,
      symbol: order.symbol,
      side: order.side,
      price: executionPrice,
      quantity: fillQuantity,
      fee
    });

    await this.repository.updateAccountCash(cashDelta, "trade_execution", trade.id);
    await this.applyPositionFill(order.symbol, order.marketId, order.side, executionPrice, fillQuantity);

    this.realtimeHub.broadcast({ type: "order.updated", data: updatedOrder });
    this.realtimeHub.broadcast({ type: "trade.execution", data: trade });
    const accountSnapshot = await this.broadcastAccount();
    return { order: updatedOrder, trade, account: accountSnapshot };
  }

  async cancelOrder(orderId: string): Promise<{ order: Order; account: AccountSnapshot }> {
    const order = await this.repository.getOrder(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    if (order.status !== "OPEN") {
      return { order, account: await this.getAccountSnapshot() };
    }

    const canceled = await this.repository.updateOrder(order.id, { status: "CANCELED" });
    this.realtimeHub.broadcast({ type: "order.updated", data: canceled });
    return { order: canceled, account: await this.broadcastAccount() };
  }

  private getImmediateExecutionPlan(
    symbol: MarketSymbol,
    side: OrderSide,
    type: "MARKET" | "LIMIT",
    quantity: number,
    inputPrice?: number
  ) {
    if (type === "MARKET") {
      return {
        price: this.marketSimulator.getExecutionPrice(symbol, side),
        quantity
      };
    }
    if (!inputPrice) return undefined;
    const book = this.marketSimulator.getOrderBook(symbol);
    return buildLimitCrossingExecutionPlan(side, inputPrice, quantity, book);
  }

  private async getMarkedPositions(): Promise<Position[]> {
    const positions = await this.repository.listPositions();
    return positions.map((position) => this.markPosition(position));
  }

  private markPosition(position: Position): Position {
    const markPrice = this.marketSimulator.getTicker(position.symbol).markPrice;
    const notional = position.quantity * markPrice;
    const unrealizedPnl = position.quantity * (markPrice - position.avgEntryPrice);

    return {
      ...position,
      markPrice,
      notional,
      unrealizedPnl
    };
  }

  private async getSpotOrderRejectionReason(
    market: Market,
    input: CreateOrderInput,
    immediateExecutionPrice: number | undefined
  ) {
    const balances = await this.getBalancesByAsset();

    if (input.side === "BUY") {
      const price = input.type === "LIMIT" ? input.price : immediateExecutionPrice;
      if (!price) {
        return "No executable price is available for this order.";
      }
      const requiredUsd = calculateQuoteWithFee(price, input.quantity);
      const availableUsd = balances.get("USD")?.available ?? 0;
      if (isGreaterThan(requiredUsd, availableUsd)) {
        return `Insufficient available USD. Required ${formatMoney(requiredUsd)}, available ${formatMoney(availableUsd)}.`;
      }
      return undefined;
    }

    const availableBase = balances.get(market.baseAsset)?.available ?? 0;
    if (isGreaterThan(input.quantity, availableBase)) {
      return `Insufficient available ${market.baseAsset}. Required ${formatQuantity(input.quantity)}, available ${formatQuantity(availableBase)}.`;
    }

    return undefined;
  }

  private async getSpotFillRejectionReason(order: Order, executionPrice: number, fillQuantity: number) {
    const market = await this.repository.getMarket(order.symbol);
    if (!market) {
      return `Unknown market: ${order.symbol}`;
    }

    const balances = await this.getBalancesByAsset(order.id);
    if (order.side === "BUY") {
      const requiredUsd = calculateQuoteWithFee(executionPrice, fillQuantity);
      const availableUsd = balances.get("USD")?.available ?? 0;
      if (isGreaterThan(requiredUsd, availableUsd)) {
        return `Insufficient available USD. Required ${formatMoney(requiredUsd)}, available ${formatMoney(availableUsd)}.`;
      }
      return undefined;
    }

    const availableBase = balances.get(market.baseAsset)?.available ?? 0;
    if (isGreaterThan(fillQuantity, availableBase)) {
      return `Insufficient available ${market.baseAsset}. Required ${formatQuantity(fillQuantity)}, available ${formatQuantity(availableBase)}.`;
    }

    return undefined;
  }

  private async getBalancesByAsset(excludeOrderId?: string) {
    const account = await this.repository.getAccount();
    const markets = await this.repository.listMarkets();
    const positions = await this.getMarkedPositions();
    const openOrders = await this.repository.listOpenOrders();
    const balances = this.calculateBalances(account, markets, positions, openOrders, excludeOrderId);
    return new Map(balances.map((balance) => [balance.asset, balance]));
  }

  private calculateBalances(
    account: Account,
    markets: Market[],
    positions: Position[],
    openOrders: Order[],
    excludeOrderId?: string
  ): AssetBalance[] {
    const activeOrders = openOrders.filter((order) => order.id !== excludeOrderId);
    const usdReserved = activeOrders
      .filter((order) => order.side === "BUY" && order.type === "LIMIT" && order.price !== null)
      .reduce((sum, order) => sum + calculateQuoteWithFee(order.price ?? 0, remainingQuantity(order)), 0);
    const balances: AssetBalance[] = [
      {
        asset: "USD",
        total: roundMoney(account.cashBalance),
        reserved: roundMoney(usdReserved),
        available: roundMoney(Math.max(0, account.cashBalance - usdReserved)),
        usdValue: roundMoney(account.cashBalance)
      }
    ];

    const positionsByMarket = new Map(positions.map((position) => [position.marketId, position]));
    const addedAssets = new Set<string>(["USD"]);

    for (const market of markets) {
      if (addedAssets.has(market.baseAsset)) {
        continue;
      }

      const position = positionsByMarket.get(market.id);
      const total = position?.quantity ?? 0;
      const reserved = activeOrders
        .filter((order) => order.symbol === market.symbol && order.side === "SELL" && order.type === "LIMIT")
        .reduce((sum, order) => sum + remainingQuantity(order), 0);
      const markPrice = this.marketSimulator.getTicker(market.symbol).markPrice;
      balances.push({
        asset: market.baseAsset,
        total: roundQuantity(total),
        reserved: roundQuantity(reserved),
        available: roundQuantity(Math.max(0, total - reserved)),
        usdValue: roundMoney(total * markPrice)
      });
      addedAssets.add(market.baseAsset);
    }

    return balances;
  }

  private async rejectOrder(input: CreateOrderInput, market: Market, clientOrderId: string, rejectReason: string) {
    const rejected = await this.repository.createOrder({
      clientOrderId,
      accountId: DEMO_ACCOUNT_ID,
      marketId: market.id,
      symbol: market.symbol,
      side: input.side,
      type: input.type,
      status: "REJECTED",
      price: input.type === "LIMIT" ? input.price ?? null : null,
      quantity: input.quantity,
      filledQuantity: 0,
      avgFillPrice: null,
      rejectReason
    });
    this.realtimeHub.broadcast({ type: "order.created", data: rejected });
    return { order: rejected, account: await this.broadcastAccount() };
  }

  private async applyPositionFill(
    symbol: MarketSymbol,
    marketId: string,
    side: OrderSide,
    price: number,
    quantity: number
  ) {
    const current = await this.repository.getPosition(DEMO_ACCOUNT_ID, marketId);
    const next = calculateNextPosition({
      currentQuantity: current?.quantity ?? 0,
      currentAvgEntryPrice: current?.avgEntryPrice ?? 0,
      currentRealizedPnl: current?.realizedPnl ?? 0,
      side,
      fillPrice: price,
      fillQuantity: quantity
    });

    await this.repository.upsertPosition({
      accountId: DEMO_ACCOUNT_ID,
      marketId,
      symbol,
      quantity: next.quantity,
      avgEntryPrice: next.avgEntryPrice,
      realizedPnl: next.realizedPnl
    });
  }

  private async broadcastAccount() {
    const account = await this.getAccountSnapshot();
    const event: WsServerEvent = { type: "account.updated", data: account };
    this.realtimeHub.broadcast(event);
    return account;
  }
}

interface OrderExecutionResult {
  order: Order;
  trade?: Trade;
  account: AccountSnapshot;
}

interface ExecutionPlan {
  price: number;
  quantity: number;
}

interface PositionFillInput {
  currentQuantity: number;
  currentAvgEntryPrice: number;
  currentRealizedPnl: number;
  side: OrderSide;
  fillPrice: number;
  fillQuantity: number;
}

export function calculateNextPosition(input: PositionFillInput) {
  const signedFill = input.side === "BUY" ? input.fillQuantity : -input.fillQuantity;
  const currentQuantity = input.currentQuantity;
  const nextQuantity = currentQuantity + signedFill;
  let avgEntryPrice = input.currentAvgEntryPrice;
  let realizedPnl = input.currentRealizedPnl;

  if (currentQuantity === 0 || Math.sign(currentQuantity) === Math.sign(signedFill)) {
    const grossQuantity = Math.abs(currentQuantity) + Math.abs(signedFill);
    avgEntryPrice =
      grossQuantity === 0
        ? 0
        : (Math.abs(currentQuantity) * input.currentAvgEntryPrice + Math.abs(signedFill) * input.fillPrice) /
          grossQuantity;
  } else {
    const closedQuantity = Math.min(Math.abs(currentQuantity), Math.abs(signedFill));
    const direction = currentQuantity > 0 ? 1 : -1;
    realizedPnl += (input.fillPrice - input.currentAvgEntryPrice) * closedQuantity * direction;

    if (Math.sign(nextQuantity) !== Math.sign(currentQuantity) && nextQuantity !== 0) {
      avgEntryPrice = input.fillPrice;
    } else if (nextQuantity === 0) {
      avgEntryPrice = 0;
    }
  }

  return {
    quantity: Number(nextQuantity.toFixed(8)),
    avgEntryPrice: Number(avgEntryPrice.toFixed(8)),
    realizedPnl: Number(realizedPnl.toFixed(8))
  };
}

function getCrossingExecutionPlan(order: Order, orderBook: OrderBookSnapshot) {
  if (order.status !== "OPEN" || order.type !== "LIMIT" || order.price === null) {
    return undefined;
  }

  return buildLimitCrossingExecutionPlan(order.side, order.price, remainingQuantity(order), orderBook);
}

function buildLimitCrossingExecutionPlan(
  side: OrderSide,
  limitPrice: number,
  requestedQuantity: number,
  orderBook: OrderBookSnapshot
): ExecutionPlan | undefined {
  const levels = side === "BUY" ? orderBook.asks : orderBook.bids;
  let remaining = requestedQuantity;
  let filledQuantity = 0;
  let notional = 0;

  for (const level of levels) {
    const crosses = side === "BUY" ? level.price <= limitPrice : level.price >= limitPrice;
    if (!crosses || remaining <= EPSILON) {
      break;
    }

    const quantity = Math.min(remaining, level.size);
    filledQuantity += quantity;
    notional += quantity * level.price;
    remaining -= quantity;
  }

  if (filledQuantity <= EPSILON) {
    return undefined;
  }

  return {
    price: roundMoney(notional / filledQuantity),
    quantity: roundQuantity(filledQuantity)
  };
}

function calculateAverageFillPrice(order: Order, executionPrice: number, fillQuantity: number) {
  const existingFilledQuantity = order.filledQuantity;
  const existingNotional = (order.avgFillPrice ?? 0) * existingFilledQuantity;
  const nextFilledQuantity = existingFilledQuantity + fillQuantity;
  return roundMoney((existingNotional + executionPrice * fillQuantity) / nextFilledQuantity);
}

function remainingQuantity(order: Order) {
  return roundQuantity(Math.max(0, order.quantity - order.filledQuantity));
}

function calculateQuoteWithFee(price: number, quantity: number) {
  return roundMoney(price * quantity * (1 + FEE_RATE));
}

function isGreaterThan(left: number, right: number) {
  return left - right > EPSILON;
}

function roundMoney(value: number) {
  return normalizeZero(Number(value.toFixed(8)));
}

function roundQuantity(value: number) {
  return normalizeZero(Number(value.toFixed(8)));
}

function normalizeZero(value: number) {
  return Math.abs(value) < EPSILON ? 0 : value;
}

function formatMoney(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}
