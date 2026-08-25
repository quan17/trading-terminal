export const MARKET_SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD"] as const;

export type MarketSymbol = (typeof MARKET_SYMBOLS)[number];
export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus = "OPEN" | "FILLED" | "CANCELED" | "REJECTED";

export interface Market {
  id: string;
  symbol: MarketSymbol;
  baseAsset: string;
  quoteAsset: string;
  tickSize: number;
  quantityStep: number;
  minOrderSize: number;
}

export interface Account {
  id: string;
  name: string;
  cashBalance: number;
  equity: number;
  buyingPower: number;
}

export interface AssetBalance {
  asset: string;
  total: number;
  reserved: number;
  available: number;
  usdValue: number;
}

export interface PortfolioSummary {
  startingEquity: number;
  equity: number;
  totalPnl: number;
  totalPnlPercent: number;
  realizedPnl: number;
  unrealizedPnl: number;
  feesPaid: number;
}

export interface Position {
  id: string;
  accountId: string;
  marketId: string;
  symbol: MarketSymbol;
  quantity: number;
  avgEntryPrice: number;
  markPrice: number;
  notional: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface Order {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  orderId?: string;
  accountId?: string;
  marketId?: string;
  symbol: MarketSymbol;
  side: OrderSide;
  price: number;
  quantity: number;
  fee?: number;
  createdAt: string;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  total?: number;
}

export interface OrderBookSnapshot {
  symbol: MarketSymbol;
  sequence: number;
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number;
  bestAsk: number;
  mid: number;
  spread: number;
}

export interface Ticker {
  symbol: MarketSymbol;
  price: number;
  markPrice: number;
  indexPrice: number;
  change24h: number;
  volume24h: number;
  fundingRate: number;
  timestamp: number;
}

export interface Candle {
  symbol: MarketSymbol;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AccountSnapshot {
  account: Account;
  portfolio: PortfolioSummary;
  balances: AssetBalance[];
  positions: Position[];
  orders: Order[];
  trades: Trade[];
}

export interface MarketSnapshot {
  ticker: Ticker;
  orderBook: OrderBookSnapshot;
  trades: Trade[];
  candles: Candle[];
}

export interface ApiError {
  message: string;
  code?: string;
  issues?: unknown;
}

export type WsClientMessage =
  | { type: "subscribe"; symbols: MarketSymbol[] }
  | { type: "ping"; timestamp: number };

export type WsServerEvent =
  | { type: "system.ready"; timestamp: number; markets: Market[] }
  | { type: "market.ticker"; data: Ticker }
  | { type: "market.orderbook"; data: OrderBookSnapshot }
  | { type: "market.trade"; data: Trade }
  | { type: "market.candle"; data: Candle }
  | { type: "order.created"; data: Order }
  | { type: "order.updated"; data: Order }
  | { type: "trade.execution"; data: Trade }
  | { type: "account.updated"; data: AccountSnapshot }
  | { type: "pong"; timestamp: number }
  | { type: "error"; message: string };
