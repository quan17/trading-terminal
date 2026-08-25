import type { Market } from "@reya/shared";

export const DEMO_ACCOUNT_ID = "account_demo";

export const DEMO_MARKETS: Market[] = [
  {
    id: "market_btc_usd",
    symbol: "BTC-USD",
    baseAsset: "BTC",
    quoteAsset: "USD",
    tickSize: 1,
    quantityStep: 0.001,
    minOrderSize: 0.001
  },
  {
    id: "market_eth_usd",
    symbol: "ETH-USD",
    baseAsset: "ETH",
    quoteAsset: "USD",
    tickSize: 0.1,
    quantityStep: 0.01,
    minOrderSize: 0.01
  },
  {
    id: "market_sol_usd",
    symbol: "SOL-USD",
    baseAsset: "SOL",
    quoteAsset: "USD",
    tickSize: 0.01,
    quantityStep: 0.1,
    minOrderSize: 0.1
  }
];

export const STARTING_PRICES: Record<string, number> = {
  "BTC-USD": 64250,
  "ETH-USD": 3185,
  "SOL-USD": 148.75
};
