import type { Account, Market, MarketSymbol, Order, OrderSide, OrderStatus, OrderType, Position, Trade } from "@reya/shared";

export interface CreateOrderRecord {
  clientOrderId: string;
  accountId: string;
  marketId: string;
  symbol: MarketSymbol;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  price: number | null;
  quantity: number;
  filledQuantity: number;
  avgFillPrice: number | null;
  rejectReason?: string | null;
}

export interface UpdateOrderRecord {
  status?: OrderStatus;
  filledQuantity?: number;
  avgFillPrice?: number | null;
  rejectReason?: string | null;
}

export interface CreateTradeRecord {
  orderId: string;
  accountId: string;
  marketId: string;
  symbol: MarketSymbol;
  side: OrderSide;
  price: number;
  quantity: number;
  fee: number;
}

export interface UpsertPositionRecord {
  accountId: string;
  marketId: string;
  symbol: MarketSymbol;
  quantity: number;
  avgEntryPrice: number;
  realizedPnl: number;
}

export interface TradingRepository {
  kind: "postgres" | "memory";
  seed(): Promise<void>;
  close(): Promise<void>;
  listMarkets(): Promise<Market[]>;
  getMarket(symbol: MarketSymbol): Promise<Market | null>;
  getAccount(): Promise<Account>;
  updateAccountCash(delta: number, reason: string, refId?: string): Promise<Account>;
  createOrder(input: CreateOrderRecord): Promise<Order>;
  updateOrder(id: string, input: UpdateOrderRecord): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  listOpenOrders(symbol?: MarketSymbol): Promise<Order[]>;
  listOrders(limit?: number): Promise<Order[]>;
  createTrade(input: CreateTradeRecord): Promise<Trade>;
  listTrades(limit?: number): Promise<Trade[]>;
  getPosition(accountId: string, marketId: string): Promise<Position | null>;
  upsertPosition(input: UpsertPositionRecord): Promise<Position>;
  listPositions(): Promise<Position[]>;
}
