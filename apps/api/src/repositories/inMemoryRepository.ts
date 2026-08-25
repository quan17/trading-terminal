import type { Account, Market, MarketSymbol, Order, Position, Trade } from "@reya/shared";
import { DEMO_ACCOUNT_ID, DEMO_MARKETS } from "../market/defaults";
import type {
  CreateOrderRecord,
  CreateTradeRecord,
  TradingRepository,
  UpdateOrderRecord,
  UpsertPositionRecord
} from "./types";

export class InMemoryTradingRepository implements TradingRepository {
  readonly kind = "memory" as const;
  private markets = new Map<MarketSymbol, Market>();
  private account: Account = {
    id: DEMO_ACCOUNT_ID,
    name: "Demo Account",
    cashBalance: 100_000,
    equity: 100_000,
    buyingPower: 200_000
  };
  private orders = new Map<string, Order>();
  private trades = new Map<string, Trade>();
  private positions = new Map<string, Position>();

  async seed() {
    for (const market of DEMO_MARKETS) {
      this.markets.set(market.symbol, market);
    }
  }

  async close() {
    return Promise.resolve();
  }

  async listMarkets() {
    return Array.from(this.markets.values());
  }

  async getMarket(symbol: MarketSymbol) {
    return this.markets.get(symbol) ?? null;
  }

  async getAccount() {
    return { ...this.account };
  }

  async updateAccountCash(delta: number) {
    this.account = {
      ...this.account,
      cashBalance: this.account.cashBalance + delta
    };
    return this.getAccount();
  }

  async createOrder(input: CreateOrderRecord) {
    const now = new Date().toISOString();
    const order: Order = {
      id: makeId("order"),
      ...input,
      createdAt: now,
      updatedAt: now
    };
    this.orders.set(order.id, order);
    return order;
  }

  async updateOrder(id: string, input: UpdateOrderRecord) {
    const current = this.orders.get(id);
    if (!current) {
      throw new Error(`Order not found: ${id}`);
    }
    const next: Order = {
      ...current,
      ...input,
      updatedAt: new Date().toISOString()
    };
    this.orders.set(id, next);
    return next;
  }

  async getOrder(id: string) {
    return this.orders.get(id) ?? null;
  }

  async listOpenOrders(symbol?: MarketSymbol) {
    return Array.from(this.orders.values())
      .filter((order) => order.status === "OPEN" && (!symbol || order.symbol === symbol))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  async listOrders(limit = 100) {
    return Array.from(this.orders.values())
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }

  async createTrade(input: CreateTradeRecord) {
    const trade: Trade = {
      id: makeId("trade"),
      ...input,
      createdAt: new Date().toISOString()
    };
    this.trades.set(trade.id, trade);
    return trade;
  }

  async listTrades(limit = 100) {
    return Array.from(this.trades.values())
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }

  async getPosition(accountId: string, marketId: string) {
    return this.positions.get(positionKey(accountId, marketId)) ?? null;
  }

  async upsertPosition(input: UpsertPositionRecord) {
    const existing = await this.getPosition(input.accountId, input.marketId);
    const position: Position = {
      id: existing?.id ?? makeId("position"),
      accountId: input.accountId,
      marketId: input.marketId,
      symbol: input.symbol,
      quantity: input.quantity,
      avgEntryPrice: input.avgEntryPrice,
      realizedPnl: input.realizedPnl,
      markPrice: 0,
      notional: 0,
      unrealizedPnl: 0
    };
    this.positions.set(positionKey(input.accountId, input.marketId), position);
    return position;
  }

  async listPositions() {
    return Array.from(this.positions.values());
  }
}

function positionKey(accountId: string, marketId: string) {
  return `${accountId}:${marketId}`;
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
