"use client";

import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";
import { formatNumber } from "@reya/shared";
import type { Candle, MarketSymbol, OrderBookSnapshot, Ticker } from "@reya/shared";
import { useTradingStore } from "../../lib/tradingStore";
import { EMPTY_CANDLES } from "../../lib/empty";
import { PanelShell } from "../ui/PanelShell";

interface MarketReference {
  circulatingSupply: number;
  maxSupply: number | null;
}

const MARKET_REFERENCES: Record<MarketSymbol, MarketReference> = {
  "BTC-USD": {
    circulatingSupply: 20_070_000,
    maxSupply: 21_000_000
  },
  "ETH-USD": {
    circulatingSupply: 120_200_000,
    maxSupply: null
  },
  "SOL-USD": {
    circulatingSupply: 470_000_000,
    maxSupply: null
  }
};

export function PriceChartPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const selectedSymbol = useTradingStore((state) => state.selectedSymbol);
  const candles = useTradingStore((state) => state.candles[selectedSymbol] ?? EMPTY_CANDLES);
  const ticker = useTradingStore((state) => state.tickers[selectedSymbol]);
  const book = useTradingStore((state) => state.orderBooks[selectedSymbol]);
  const markets = useTradingStore((state) => state.markets);
  const market = markets.find((item) => item.symbol === selectedSymbol);

  const data = useMemo(
    () =>
      candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      })),
    [candles]
  );
  const stats = useMemo(
    () => buildMarketStats(selectedSymbol, ticker, candles, book, market?.baseAsset ?? selectedSymbol.replace("-USD", "")),
    [book, candles, market?.baseAsset, selectedSymbol, ticker]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#0f141b" },
        textColor: "#b7c1d1"
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" }
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.12)"
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.12)",
        timeVisible: true,
        secondsVisible: true
      },
      crosshair: {
        mode: 1
      }
    });
    const series = chart.addCandlestickSeries({
      upColor: "#17c964",
      downColor: "#f31260",
      borderUpColor: "#17c964",
      borderDownColor: "#f31260",
      wickUpColor: "#17c964",
      wickDownColor: "#f31260"
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      chart.applyOptions({ width: rect.width, height: rect.height });
      chart.timeScale().fitContent();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);
    resize();

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    seriesRef.current?.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [data, selectedSymbol]);

  return (
    <PanelShell
      title={selectedSymbol}
      meta={ticker ? <span className={(ticker.change24h ?? 0) >= 0 ? "up" : "down"}>${formatNumber(ticker.price, 2)}</span> : null}
      className="chart-panel"
    >
      <div ref={containerRef} className="chart-canvas" data-testid="price-chart" />
      <MarketStatsScorecard stats={stats} />
    </PanelShell>
  );
}

function MarketStatsScorecard({ stats }: { stats: StatItem[] }) {
  return (
    <div className="market-scorecard" data-testid="market-scorecard">
      {stats.map((stat) => (
        <div key={stat.label} className="market-stat">
          <span>{stat.label}</span>
          <strong className={stat.tone}>{stat.value}</strong>
        </div>
      ))}
    </div>
  );
}

interface StatItem {
  label: string;
  value: string;
  tone?: "up" | "down";
}

function buildMarketStats(
  symbol: MarketSymbol,
  ticker: Ticker | undefined,
  candles: Candle[],
  book: OrderBookSnapshot | undefined,
  baseAsset: string
): StatItem[] {
  const reference = MARKET_REFERENCES[symbol];
  const mark = ticker?.markPrice ?? ticker?.price ?? candles.at(-1)?.close;
  const firstCandle = candles[0];
  const lastCandle = candles.at(-1);
  const open = firstCandle?.open ?? mark;
  const previousClose = candles.at(-2)?.close ?? open;
  const dayLow = candles.length ? Math.min(...candles.map((candle) => candle.low)) : undefined;
  const dayHigh = candles.length ? Math.max(...candles.map((candle) => candle.high)) : undefined;
  const marketCap = mark ? mark * reference.circulatingSupply : undefined;
  const fdv = mark && reference.maxSupply ? mark * reference.maxSupply : undefined;
  const volumeToCap = ticker?.volume24h && marketCap ? (ticker.volume24h / marketCap) * 100 : undefined;
  const bidDepth = book ? sumDepth(book.bids, 16) : undefined;
  const askDepth = book ? sumDepth(book.asks, 16) : undefined;
  const totalDepth = bidDepth !== undefined && askDepth !== undefined ? bidDepth + askDepth : undefined;
  const imbalance =
    bidDepth !== undefined && askDepth !== undefined && totalDepth
      ? ((bidDepth - askDepth) / totalDepth) * 100
      : undefined;
  const spreadPercent = book && book.mid > 0 ? (book.spread / book.mid) * 100 : undefined;

  return [
    { label: "Market Cap", value: formatUsdCompact(marketCap) },
    { label: "Open", value: formatUsd(open) },
    { label: "Spread", value: book ? `${formatUsd(book.spread)} (${formatPercent(spreadPercent)})` : "-" },
    { label: "24h Volume", value: formatUsdCompact(ticker?.volume24h) },
    { label: "FDV", value: formatUsdCompact(fdv) },
    { label: "Day Range", value: formatRange(dayLow, dayHigh) },
    { label: "Best Bid / Ask", value: book ? `${formatUsd(book.bestBid)} / ${formatUsd(book.bestAsk)}` : "-" },
    { label: "Depth 16", value: totalDepth !== undefined ? `${formatNumber(totalDepth, 3)} ${baseAsset}` : "-" },
    { label: "Vol / Mkt Cap", value: formatPercent(volumeToCap) },
    { label: "Previous Close", value: formatUsd(previousClose) },
    {
      label: "Book Imbalance",
      value: formatSignedPercent(imbalance),
      tone: (imbalance ?? 0) >= 0 ? "up" : "down"
    },
    { label: "Circ / Max Supply", value: formatSupply(reference.circulatingSupply, reference.maxSupply, baseAsset) }
  ];
}

function sumDepth(levels: OrderBookSnapshot["bids"], count: number) {
  return levels.slice(0, count).reduce((sum, level) => sum + level.size, 0);
}

function formatUsd(value: number | undefined) {
  return value === undefined || !Number.isFinite(value) ? "-" : `$${formatNumber(value, 2)}`;
}

function formatRange(low: number | undefined, high: number | undefined) {
  if (low === undefined || high === undefined) return "-";
  return `${formatUsd(low)} - ${formatUsd(high)}`;
}

function formatPercent(value: number | undefined) {
  return value === undefined || !Number.isFinite(value) ? "-" : `${formatNumber(value, 3)}%`;
}

function formatSignedPercent(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 2)}%`;
}

function formatUsdCompact(value: number | undefined) {
  return value === undefined || !Number.isFinite(value) ? "-" : `$${formatCompact(value)}`;
}

function formatSupply(circulatingSupply: number, maxSupply: number | null, asset: string) {
  const circulating = `${formatCompact(circulatingSupply)} ${asset}`;
  if (!maxSupply) return circulating;
  return `${circulating} / ${formatCompact(maxSupply)}`;
}

function formatCompact(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000_000) return `${formatNumber(value / 1_000_000_000_000, 2)}T`;
  if (absolute >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 2)}B`;
  if (absolute >= 1_000_000) return `${formatNumber(value / 1_000_000, 2)}M`;
  if (absolute >= 1_000) return `${formatNumber(value / 1_000, 2)}K`;
  return formatNumber(value, 2);
}
