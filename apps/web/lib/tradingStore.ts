"use client";

import { create } from "zustand";
import type {
  AccountSnapshot,
  Candle,
  Market,
  MarketSnapshot,
  MarketSymbol,
  Order,
  OrderBookSnapshot,
  Ticker,
  Trade,
  WsServerEvent
} from "@reya/shared";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

interface TradingState {
  connection: ConnectionState;
  selectedSymbol: MarketSymbol;
  markets: Market[];
  tickers: Partial<Record<MarketSymbol, Ticker>>;
  orderBooks: Partial<Record<MarketSymbol, OrderBookSnapshot>>;
  trades: Partial<Record<MarketSymbol, Trade[]>>;
  candles: Partial<Record<MarketSymbol, Candle[]>>;
  account?: AccountSnapshot;
  lastExecution?: Trade;
  lastOrderUpdate?: Order;
  lastEventAt?: number;
  setConnection: (connection: ConnectionState) => void;
  setSelectedSymbol: (symbol: MarketSymbol) => void;
  setMarkets: (markets: Market[]) => void;
  hydrateMarketSnapshot: (snapshot: MarketSnapshot) => void;
  setAccount: (snapshot: AccountSnapshot) => void;
  applyWsEvent: (event: WsServerEvent) => void;
}

export const useTradingStore = create<TradingState>((set, get) => ({
  connection: "connecting",
  selectedSymbol: "BTC-USD",
  markets: [],
  tickers: {},
  orderBooks: {},
  trades: {},
  candles: {},
  setConnection: (connection) => set({ connection }),
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
  setMarkets: (markets) => set({ markets }),
  hydrateMarketSnapshot: (snapshot) =>
    set((state) => ({
      tickers: { ...state.tickers, [snapshot.ticker.symbol]: snapshot.ticker },
      orderBooks: { ...state.orderBooks, [snapshot.orderBook.symbol]: snapshot.orderBook },
      trades: { ...state.trades, [snapshot.ticker.symbol]: snapshot.trades },
      candles: { ...state.candles, [snapshot.ticker.symbol]: normalizeCandles(snapshot.candles) }
    })),
  setAccount: (account) => set({ account }),
  applyWsEvent: (event) => {
    const state = get();
    if (event.type === "system.ready") {
      set({ markets: event.markets, lastEventAt: event.timestamp });
      return;
    }

    if (event.type === "market.ticker") {
      set({
        tickers: { ...state.tickers, [event.data.symbol]: event.data },
        lastEventAt: event.data.timestamp
      });
      return;
    }

    if (event.type === "market.orderbook") {
      set({
        orderBooks: { ...state.orderBooks, [event.data.symbol]: event.data },
        lastEventAt: event.data.timestamp
      });
      return;
    }

    if (event.type === "market.trade") {
      const current = state.trades[event.data.symbol] ?? [];
      if (current.some((trade) => trade.id === event.data.id)) {
        set({ lastEventAt: Date.parse(event.data.createdAt) });
        return;
      }
      set({
        trades: {
          ...state.trades,
          [event.data.symbol]: [event.data, ...current].slice(0, 100)
        },
        lastEventAt: Date.parse(event.data.createdAt)
      });
      return;
    }

    if (event.type === "market.candle") {
      const current = state.candles[event.data.symbol] ?? [];
      set({
        candles: { ...state.candles, [event.data.symbol]: upsertCandle(current, event.data) },
        lastEventAt: Date.now()
      });
      return;
    }

    if (event.type === "account.updated") {
      set({ account: event.data, lastEventAt: Date.now() });
      return;
    }

    if (event.type === "order.created" || event.type === "order.updated") {
      const account = upsertAccountOrder(state.account, event.data);
      set({
        ...(account ? { account } : {}),
        lastOrderUpdate: event.data,
        lastEventAt: Date.now()
      });
      return;
    }

    if (event.type === "trade.execution") {
      const current = state.trades[event.data.symbol] ?? [];
      const account = upsertAccountTrade(state.account, event.data);
      set({
        ...(account ? { account } : {}),
        trades: {
          ...state.trades,
          [event.data.symbol]: upsertTrade(current, event.data).slice(0, 100)
        },
        lastExecution: event.data,
        lastEventAt: Date.now()
      });
    }
  }
}));

function upsertAccountOrder(account: AccountSnapshot | undefined, order: Order) {
  if (!account) return undefined;
  return {
    ...account,
    orders: upsertOrder(account.orders, order)
  };
}

function upsertAccountTrade(account: AccountSnapshot | undefined, trade: Trade) {
  if (!account) return undefined;
  return {
    ...account,
    trades: upsertTrade(account.trades, trade)
  };
}

function upsertOrder(orders: Order[], order: Order) {
  const next = orders.some((item) => item.id === order.id)
    ? orders.map((item) => (item.id === order.id ? order : item))
    : [order, ...orders];
  return next.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function upsertTrade(trades: Trade[], trade: Trade) {
  const next = trades.some((item) => item.id === trade.id)
    ? trades.map((item) => (item.id === trade.id ? trade : item))
    : [trade, ...trades];
  return next.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function upsertCandle(candles: Candle[], candle: Candle) {
  const next = candles.some((item) => item.time === candle.time)
    ? candles.map((item) => (item.time === candle.time ? candle : item))
    : [...candles, candle];
  return normalizeCandles(next);
}

function normalizeCandles(candles: Candle[]) {
  const byTime = new Map<number, Candle>();
  for (const candle of candles) {
    byTime.set(candle.time, candle);
  }
  return Array.from(byTime.values())
    .sort((a, b) => a.time - b.time)
    .slice(-240);
}
