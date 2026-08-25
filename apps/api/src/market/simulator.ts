import { EventEmitter } from "node:events";
import type {
  Candle,
  Market,
  MarketSnapshot,
  MarketSymbol,
  OrderBookLevel,
  OrderBookSnapshot,
  Ticker,
  Trade,
  WsServerEvent
} from "@reya/shared";
import { DEMO_MARKETS, STARTING_PRICES } from "./defaults";

const ORDER_BOOK_LEVELS_PER_SIDE = 320;
const TARGET_TOP_LEVEL_NOTIONAL = 10_000;

interface RuntimeMarket {
  market: Market;
  sequence: number;
  mid: number;
  volatility: number;
  ticker: Ticker;
  orderBook: OrderBookSnapshot;
  trades: Trade[];
  candles: Candle[];
}

export class MarketSimulator {
  private readonly emitter = new EventEmitter();
  private readonly markets = new Map<MarketSymbol, RuntimeMarket>();
  private interval: NodeJS.Timeout | undefined;

  constructor(markets: Market[] = DEMO_MARKETS) {
    for (const market of markets) {
      const mid = STARTING_PRICES[market.symbol] ?? 100;
      const state = this.createRuntimeMarket(market, mid);
      this.markets.set(market.symbol, state);
    }
  }

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), 700);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  onEvent(listener: (event: WsServerEvent) => void) {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  getMarkets() {
    return Array.from(this.markets.values()).map((runtime) => runtime.market);
  }

  getTicker(symbol: MarketSymbol): Ticker {
    return this.requireMarket(symbol).ticker;
  }

  getOrderBook(symbol: MarketSymbol): OrderBookSnapshot {
    return this.requireMarket(symbol).orderBook;
  }

  getSnapshot(symbol: MarketSymbol): MarketSnapshot {
    const runtime = this.requireMarket(symbol);
    return {
      ticker: runtime.ticker,
      orderBook: runtime.orderBook,
      trades: runtime.trades.slice(0, 80),
      candles: runtime.candles.slice(-180)
    };
  }

  getExecutionPrice(symbol: MarketSymbol, side: "BUY" | "SELL") {
    const orderBook = this.getOrderBook(symbol);
    return side === "BUY" ? orderBook.bestAsk : orderBook.bestBid;
  }

  private tick() {
    for (const runtime of this.markets.values()) {
      runtime.sequence += 1;
      const now = Date.now();
      const randomWalk = (Math.random() - 0.47) * runtime.volatility;
      const anchor = STARTING_PRICES[runtime.market.symbol] ?? runtime.mid;
      const meanReversion = (anchor - runtime.mid) * 0.00015;
      runtime.mid = Math.max(runtime.market.tickSize, runtime.mid + randomWalk + meanReversion);

      const orderBook = this.buildOrderBook(runtime, now);
      const ticker = this.buildTicker(runtime, now);
      const trade = this.buildTrade(runtime, now);
      const candle = this.updateCandles(runtime, trade);

      runtime.orderBook = orderBook;
      runtime.ticker = ticker;
      runtime.trades.unshift(trade);
      runtime.trades = runtime.trades.slice(0, 120);

      this.emit({ type: "market.ticker", data: ticker });
      this.emit({ type: "market.orderbook", data: orderBook });
      this.emit({ type: "market.trade", data: trade });
      this.emit({ type: "market.candle", data: candle });
    }
  }

  private createRuntimeMarket(market: Market, mid: number): RuntimeMarket {
    const volatility = Math.max(market.tickSize, mid * 0.0008);
    const runtime: RuntimeMarket = {
      market,
      sequence: 1,
      mid,
      volatility,
      ticker: {
        symbol: market.symbol,
        price: mid,
        markPrice: mid,
        indexPrice: mid * 0.9995,
        change24h: 0,
        volume24h: 0,
        fundingRate: 0.00012,
        timestamp: Date.now()
      },
      orderBook: this.emptyOrderBook(market, mid),
      trades: [],
      candles: []
    };

    runtime.orderBook = this.buildOrderBook(runtime, Date.now());
    runtime.candles = this.bootstrapCandles(market.symbol, mid);
    return runtime;
  }

  private buildTicker(runtime: RuntimeMarket, timestamp: number): Ticker {
    const open = runtime.candles.at(-120)?.open ?? STARTING_PRICES[runtime.market.symbol] ?? runtime.mid;
    const change24h = ((runtime.mid - open) / open) * 100;
    const recentVolume = runtime.trades.reduce((sum, trade) => sum + trade.quantity * trade.price, 0);

    return {
      symbol: runtime.market.symbol,
      price: runtime.mid,
      markPrice: runtime.mid * (1 + Math.sin(runtime.sequence / 25) * 0.0003),
      indexPrice: runtime.mid * (1 - Math.cos(runtime.sequence / 30) * 0.0002),
      change24h,
      volume24h: 25_000_000 + recentVolume * 30,
      fundingRate: 0.0001 + Math.sin(runtime.sequence / 50) * 0.00004,
      timestamp
    };
  }

  private buildOrderBook(runtime: RuntimeMarket, timestamp: number): OrderBookSnapshot {
    const { market, mid, sequence } = runtime;
    const spreadWidth = Math.max(market.tickSize * 2, mid * 0.00016);
    const bestBid = this.roundToTick(mid - spreadWidth / 2, market.tickSize);
    const bestAsk = this.roundToTick(mid + spreadWidth / 2, market.tickSize);
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];

    for (let index = 0; index < ORDER_BOOK_LEVELS_PER_SIDE; index += 1) {
      const distance = index + 1;
      const wallMultiplier = index > 0 && index % 12 === 0 ? 1.85 : 1;
      const topLevelSize = TARGET_TOP_LEVEL_NOTIONAL / mid;
      const baseSize = Math.max(market.minOrderSize, (topLevelSize / Math.pow(distance, 0.42)) * wallMultiplier);
      const wave = 1 + Math.sin(sequence / 5 + index) * 0.18;
      const noise = 0.75 + Math.random() * 0.5;
      const size = this.roundQuantity(baseSize * wave * noise, market.quantityStep);
      bids.push({
        price: this.roundToTick(bestBid - market.tickSize * index, market.tickSize),
        size
      });
      asks.push({
        price: this.roundToTick(bestAsk + market.tickSize * index, market.tickSize),
        size: this.roundQuantity(baseSize * (2 - wave) * noise, market.quantityStep)
      });
    }

    return {
      symbol: market.symbol,
      sequence,
      timestamp,
      bids,
      asks,
      bestBid,
      bestAsk,
      mid: (bestBid + bestAsk) / 2,
      spread: bestAsk - bestBid
    };
  }

  private buildTrade(runtime: RuntimeMarket, timestamp: number): Trade {
    const side = Math.random() > 0.5 ? "BUY" : "SELL";
    const price = this.getExecutionPrice(runtime.market.symbol, side);
    const quantity = this.roundQuantity(
      runtime.market.minOrderSize * (1 + Math.random() * 80),
      runtime.market.quantityStep
    );

    return {
      id: `sim_${runtime.market.symbol}_${runtime.sequence}_${Math.random().toString(16).slice(2)}`,
      symbol: runtime.market.symbol,
      side,
      price,
      quantity,
      createdAt: new Date(timestamp).toISOString()
    };
  }

  private updateCandles(runtime: RuntimeMarket, trade: Trade): Candle {
    const bucket = Math.floor(Date.now() / 1000);
    const existing = runtime.candles.at(-1);
    if (existing && existing.time === bucket) {
      existing.high = Math.max(existing.high, trade.price);
      existing.low = Math.min(existing.low, trade.price);
      existing.close = trade.price;
      existing.volume += trade.quantity;
      return existing;
    }

    const candle: Candle = {
      symbol: runtime.market.symbol,
      time: bucket,
      open: existing?.close ?? trade.price,
      high: trade.price,
      low: trade.price,
      close: trade.price,
      volume: trade.quantity
    };
    runtime.candles.push(candle);
    runtime.candles = runtime.candles.slice(-240);
    return candle;
  }

  private bootstrapCandles(symbol: MarketSymbol, startPrice: number): Candle[] {
    const now = Math.floor(Date.now() / 1000);
    const candles: Candle[] = [];
    let price = startPrice;
    for (let i = 180; i >= 1; i -= 1) {
      const open = price;
      price = Math.max(1, price + (Math.random() - 0.48) * startPrice * 0.001);
      const close = price;
      candles.push({
        symbol,
        time: now - i,
        open,
        high: Math.max(open, close) * (1 + Math.random() * 0.0009),
        low: Math.min(open, close) * (1 - Math.random() * 0.0009),
        close,
        volume: Math.random() * 12
      });
    }
    return candles;
  }

  private emptyOrderBook(market: Market, mid: number): OrderBookSnapshot {
    return {
      symbol: market.symbol,
      sequence: 0,
      timestamp: Date.now(),
      bids: [],
      asks: [],
      bestBid: mid - market.tickSize,
      bestAsk: mid + market.tickSize,
      mid,
      spread: market.tickSize * 2
    };
  }

  private requireMarket(symbol: MarketSymbol) {
    const runtime = this.markets.get(symbol);
    if (!runtime) {
      throw new Error(`Unknown market: ${symbol}`);
    }
    return runtime;
  }

  private roundToTick(value: number, tickSize: number) {
    return Number((Math.round(value / tickSize) * tickSize).toFixed(8));
  }

  private roundQuantity(value: number, quantityStep: number) {
    return Number((Math.max(quantityStep, Math.round(value / quantityStep) * quantityStep)).toFixed(8));
  }

  private emit(event: WsServerEvent) {
    this.emitter.emit("event", event);
  }
}
