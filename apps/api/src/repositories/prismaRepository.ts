import { Prisma, PrismaClient } from "@prisma/client";
import type { Account, Market, MarketSymbol, Order, Position, Trade } from "@reya/shared";
import { marketSymbolSchema } from "@reya/shared";
import { DEMO_ACCOUNT_ID, DEMO_MARKETS } from "../market/defaults";
import type {
  CreateOrderRecord,
  CreateTradeRecord,
  TradingRepository,
  UpdateOrderRecord,
  UpsertPositionRecord
} from "./types";

type MarketRow = Prisma.MarketGetPayload<{}>;
type AccountRow = Prisma.AccountGetPayload<{}>;
type OrderWithMarketRow = Prisma.OrderGetPayload<{ include: { market: true } }>;
type TradeWithMarketRow = Prisma.TradeGetPayload<{ include: { market: true } }>;
type PositionWithMarketRow = Prisma.PositionGetPayload<{ include: { market: true } }>;

export class PrismaTradingRepository implements TradingRepository {
  readonly kind = "postgres" as const;

  constructor(private readonly prisma: PrismaClient) {}

  async seed() {
    for (const market of DEMO_MARKETS) {
      await this.prisma.market.upsert({
        where: { symbol: market.symbol },
        update: {
          baseAsset: market.baseAsset,
          quoteAsset: market.quoteAsset,
          tickSize: market.tickSize,
          quantityStep: market.quantityStep,
          minOrderSize: market.minOrderSize
        },
        create: {
          id: market.id,
          symbol: market.symbol,
          baseAsset: market.baseAsset,
          quoteAsset: market.quoteAsset,
          tickSize: market.tickSize,
          quantityStep: market.quantityStep,
          minOrderSize: market.minOrderSize
        }
      });
    }

    await this.prisma.account.upsert({
      where: { id: DEMO_ACCOUNT_ID },
      update: {},
      create: {
        id: DEMO_ACCOUNT_ID,
        name: "Demo Account",
        cashBalance: 100_000
      }
    });
  }

  async close() {
    await this.prisma.$disconnect();
  }

  async listMarkets() {
    const rows = await this.prisma.market.findMany({ orderBy: { symbol: "asc" } });
    return rows.map(toMarket);
  }

  async getMarket(symbol: MarketSymbol) {
    const row = await this.prisma.market.findUnique({ where: { symbol } });
    return row ? toMarket(row) : null;
  }

  async getAccount() {
    const row = await this.prisma.account.findUniqueOrThrow({ where: { id: DEMO_ACCOUNT_ID } });
    return toAccount(row);
  }

  async updateAccountCash(delta: number, reason: string, refId?: string) {
    const ledgerCreate: { delta: number; reason: string; refId?: string } = { delta, reason };
    if (refId) {
      ledgerCreate.refId = refId;
    }

    const account = await this.prisma.account.update({
      where: { id: DEMO_ACCOUNT_ID },
      data: {
        cashBalance: { increment: delta },
        balanceLedger: {
          create: ledgerCreate
        }
      }
    });
    return toAccount(account);
  }

  async createOrder(input: CreateOrderRecord) {
    const data: Prisma.OrderUncheckedCreateInput = {
      clientOrderId: input.clientOrderId,
      accountId: input.accountId,
      marketId: input.marketId,
      side: input.side,
      type: input.type,
      status: input.status,
      price: input.price,
      quantity: input.quantity,
      filledQuantity: input.filledQuantity,
      avgFillPrice: input.avgFillPrice
    };
    if (input.rejectReason !== undefined) {
      data.rejectReason = input.rejectReason;
    }

    const row = await this.prisma.order.create({
      data,
      include: { market: true }
    });
    return toOrder(row);
  }

  async updateOrder(id: string, input: UpdateOrderRecord) {
    const data: Prisma.OrderUpdateInput = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.filledQuantity !== undefined) data.filledQuantity = input.filledQuantity;
    if (input.avgFillPrice !== undefined) data.avgFillPrice = input.avgFillPrice;
    if (input.rejectReason !== undefined) data.rejectReason = input.rejectReason;

    const row = await this.prisma.order.update({
      where: { id },
      data,
      include: { market: true }
    });
    return toOrder(row);
  }

  async getOrder(id: string) {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: { market: true }
    });
    return row ? toOrder(row) : null;
  }

  async listOpenOrders(symbol?: MarketSymbol) {
    const where: Prisma.OrderWhereInput = {
      status: "OPEN"
    };
    if (symbol) {
      where.market = { symbol };
    }

    const rows = await this.prisma.order.findMany({
      where,
      include: { market: true },
      orderBy: { createdAt: "asc" }
    });
    return rows.map(toOrder);
  }

  async listOrders(limit = 100) {
    const rows = await this.prisma.order.findMany({
      include: { market: true },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return rows.map(toOrder);
  }

  async createTrade(input: CreateTradeRecord) {
    const row = await this.prisma.trade.create({
      data: {
        orderId: input.orderId,
        accountId: input.accountId,
        marketId: input.marketId,
        side: input.side,
        price: input.price,
        quantity: input.quantity,
        fee: input.fee
      },
      include: { market: true }
    });
    return toTrade(row);
  }

  async listTrades(limit = 100) {
    const rows = await this.prisma.trade.findMany({
      include: { market: true },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return rows.map(toTrade);
  }

  async getPosition(accountId: string, marketId: string) {
    const row = await this.prisma.position.findUnique({
      where: { accountId_marketId: { accountId, marketId } },
      include: { market: true }
    });
    return row ? toPosition(row) : null;
  }

  async upsertPosition(input: UpsertPositionRecord) {
    const row = await this.prisma.position.upsert({
      where: {
        accountId_marketId: {
          accountId: input.accountId,
          marketId: input.marketId
        }
      },
      update: {
        quantity: input.quantity,
        avgEntryPrice: input.avgEntryPrice,
        realizedPnl: input.realizedPnl
      },
      create: {
        accountId: input.accountId,
        marketId: input.marketId,
        quantity: input.quantity,
        avgEntryPrice: input.avgEntryPrice,
        realizedPnl: input.realizedPnl
      },
      include: { market: true }
    });
    return toPosition(row);
  }

  async listPositions() {
    const rows = await this.prisma.position.findMany({
      include: { market: true },
      orderBy: { updatedAt: "desc" }
    });
    return rows.map(toPosition);
  }
}

function toMarket(row: MarketRow): Market {
  return {
    id: row.id,
    symbol: toMarketSymbol(row.symbol),
    baseAsset: row.baseAsset,
    quoteAsset: row.quoteAsset,
    tickSize: toNumber(row.tickSize),
    quantityStep: toNumber(row.quantityStep),
    minOrderSize: toNumber(row.minOrderSize)
  };
}

function toAccount(row: AccountRow): Account {
  const cashBalance = toNumber(row.cashBalance);
  return {
    id: row.id,
    name: row.name,
    cashBalance,
    equity: cashBalance,
    buyingPower: cashBalance * 2
  };
}

function toOrder(row: OrderWithMarketRow): Order {
  return {
    id: row.id,
    clientOrderId: row.clientOrderId,
    accountId: row.accountId,
    marketId: row.marketId,
    symbol: toMarketSymbol(row.market.symbol),
    side: row.side,
    type: row.type,
    status: row.status,
    price: row.price === null ? null : toNumber(row.price),
    quantity: toNumber(row.quantity),
    filledQuantity: toNumber(row.filledQuantity),
    avgFillPrice: row.avgFillPrice === null ? null : toNumber(row.avgFillPrice),
    rejectReason: row.rejectReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toTrade(row: TradeWithMarketRow): Trade {
  return {
    id: row.id,
    orderId: row.orderId,
    accountId: row.accountId,
    marketId: row.marketId,
    symbol: toMarketSymbol(row.market.symbol),
    side: row.side,
    price: toNumber(row.price),
    quantity: toNumber(row.quantity),
    fee: toNumber(row.fee),
    createdAt: row.createdAt.toISOString()
  };
}

function toPosition(row: PositionWithMarketRow): Position {
  return {
    id: row.id,
    accountId: row.accountId,
    marketId: row.marketId,
    symbol: toMarketSymbol(row.market.symbol),
    quantity: toNumber(row.quantity),
    avgEntryPrice: toNumber(row.avgEntryPrice),
    realizedPnl: toNumber(row.realizedPnl),
    markPrice: 0,
    notional: 0,
    unrealizedPnl: 0
  };
}

function toNumber(value: Prisma.Decimal | number | string) {
  return Number(value);
}

function toMarketSymbol(symbol: string): MarketSymbol {
  return marketSymbolSchema.parse(symbol);
}
