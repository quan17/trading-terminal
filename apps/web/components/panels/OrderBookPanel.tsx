"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { derivePrecision, formatNumber, prepareDepthRows } from "@reya/shared";
import type { MarketSymbol } from "@reya/shared";
import { useTradingStore } from "../../lib/tradingStore";
import { PanelShell } from "../ui/PanelShell";

const DISPLAY_LEVELS = 32;
const FLASH_VISIBLE_LEVELS = 10;
const FLASH_RELATIVE_THRESHOLD = 0.14;
const FLASH_MIN_INTERVAL_MS = 1400;
const GROUPING_MULTIPLIERS = [1, 5, 10, 25];
const FALLBACK_TICK_SIZE: Record<MarketSymbol, number> = {
  "BTC-USD": 1,
  "ETH-USD": 0.1,
  "SOL-USD": 0.01
};

export function OrderBookPanel() {
  const selectedSymbol = useTradingStore((state) => state.selectedSymbol);
  const markets = useTradingStore((state) => state.markets);
  const book = useTradingStore((state) => state.orderBooks[selectedSymbol]);
  const market = markets.find((item) => item.symbol === selectedSymbol);
  const tickSize = market?.tickSize ?? FALLBACK_TICK_SIZE[selectedSymbol];
  const groupingOptions = useMemo(() => buildGroupingOptions(tickSize), [tickSize]);
  const [bucketBySymbol, setBucketBySymbol] = useState<Partial<Record<MarketSymbol, number>>>({});
  const preferredBucket = bucketBySymbol[selectedSymbol] ?? groupingOptions[0]?.value ?? tickSize;
  const bucket = groupingOptions.some((option) => option.value === preferredBucket)
    ? preferredBucket
    : groupingOptions[0]?.value ?? tickSize;
  const precision = useMemo(() => derivePrecision(bucket), [bucket]);
  const depth = useMemo(() => {
    const bids = book ? prepareDepthRows(book.bids, "bid", bucket, DISPLAY_LEVELS) : [];
    const asks = book ? prepareDepthRows(book.asks, "ask", bucket, DISPLAY_LEVELS).reverse() : [];
    const maxTotal = Math.max(...bids.map((level) => level.total ?? 0), ...asks.map((level) => level.total ?? 0), 1);
    return { bids, asks, maxTotal };
  }, [book, bucket]);
  const spreadPercent = book && book.mid > 0 ? (book.spread / book.mid) * 100 : 0;

  return (
    <PanelShell
      title="Order Book"
      meta={
        <div className="book-toolbar">
          <span className="book-spread-meta">
            {book ? `Spread $${formatNumber(book.spread, precision.priceDecimals)}` : "Spread -"}
          </span>
          <label className="book-grouping" aria-label="Price grouping">
            <span>Group</span>
            <select
              data-testid="book-grouping"
              value={bucket}
              onChange={(event) => {
                const nextBucket = Number(event.target.value);
                setBucketBySymbol((current) => ({ ...current, [selectedSymbol]: nextBucket }));
              }}
            >
              {groupingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
      className="orderbook-panel"
    >
      <div className="book-table" data-testid="orderbook">
        <div className="book-head">
          <span>Price</span>
          <span>Size</span>
          <span>Total</span>
        </div>
        <BookSide
          rows={depth.asks}
          maxTotal={depth.maxTotal}
          side="ask"
          priceDecimals={precision.priceDecimals}
          sizeDecimals={precision.sizeDecimals}
        />
        <div className="spread-row" data-testid="spread-indicator">
          <strong>{book ? `$${formatNumber(book.mid, precision.priceDecimals)}` : "-"}</strong>
          <span>{book ? `$${formatNumber(book.spread, precision.priceDecimals)}` : "-"}</span>
          <span>{book ? `${formatNumber(spreadPercent, 4)}%` : "-"}</span>
        </div>
        <BookSide
          rows={depth.bids}
          maxTotal={depth.maxTotal}
          side="bid"
          priceDecimals={precision.priceDecimals}
          sizeDecimals={precision.sizeDecimals}
        />
      </div>
    </PanelShell>
  );
}

const BookSide = memo(function BookSide({
  rows,
  maxTotal,
  side,
  priceDecimals,
  sizeDecimals
}: {
  rows: Array<{ price: number; size: number; total?: number }>;
  maxTotal: number;
  side: "bid" | "ask";
  priceDecimals: number;
  sizeDecimals: number;
}) {
  const sideRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (side === "ask" && sideRef.current) {
      sideRef.current.scrollTop = sideRef.current.scrollHeight;
    }
  }, [rows, side]);

  return (
    <div ref={sideRef} className={`book-side ${side}s`}>
      {rows.map((level, index) => (
        <BookRow
          key={`${side}-${level.price}`}
          price={level.price}
          size={level.size}
          total={level.total ?? level.size}
          maxTotal={maxTotal}
          side={side}
          depthRank={side === "ask" ? rows.length - 1 - index : index}
          priceDecimals={priceDecimals}
          sizeDecimals={sizeDecimals}
        />
      ))}
    </div>
  );
});

const BookRow = memo(function BookRow({
  price,
  size,
  total,
  maxTotal,
  side,
  depthRank,
  priceDecimals,
  sizeDecimals
}: {
  price: number;
  size: number;
  total: number;
  maxTotal: number;
  side: "bid" | "ask";
  depthRank: number;
  priceDecimals: number;
  sizeDecimals: number;
}) {
  const flash = useRowFlash(price, size, total, depthRank);
  const width = `${Math.min(100, (total / maxTotal) * 100)}%`;
  const style = { "--depth-width": width } as CSSProperties;

  return (
    <div className={`book-row ${side}${flash ? ` book-row-${flash}` : ""}`} style={style}>
      <div className="depth-bar" />
      <span className="price">{formatNumber(price, priceDecimals)}</span>
      <span>{formatNumber(size, sizeDecimals)}</span>
      <span>{formatNumber(total, sizeDecimals)}</span>
    </div>
  );
}, areBookRowsEqual);

function areBookRowsEqual(previous: BookRowProps, next: BookRowProps) {
  return (
    previous.price === next.price &&
    previous.size === next.size &&
    previous.total === next.total &&
    previous.maxTotal === next.maxTotal &&
    previous.side === next.side &&
    previous.depthRank === next.depthRank &&
    previous.priceDecimals === next.priceDecimals &&
    previous.sizeDecimals === next.sizeDecimals
  );
}

interface BookRowProps {
  price: number;
  size: number;
  total: number;
  maxTotal: number;
  side: "bid" | "ask";
  depthRank: number;
  priceDecimals: number;
  sizeDecimals: number;
}

function useRowFlash(price: number, size: number, total: number, depthRank: number) {
  const previous = useRef<{ price: number; size: number; total: number } | undefined>(undefined);
  const lastFlashAt = useRef(0);
  const [flash, setFlash] = useState<"change" | null>(null);

  useEffect(() => {
    const previousRow = previous.current;
    previous.current = { price, size, total };
    if (!previousRow || previousRow.price !== price || depthRank >= FLASH_VISIBLE_LEVELS) {
      setFlash(null);
      return undefined;
    }

    const materialChange =
      relativeDelta(previousRow.size, size) >= FLASH_RELATIVE_THRESHOLD ||
      relativeDelta(previousRow.total, total) >= FLASH_RELATIVE_THRESHOLD;
    if (!materialChange) {
      setFlash(null);
      return undefined;
    }

    const now = Date.now();
    if (now - lastFlashAt.current < FLASH_MIN_INTERVAL_MS) {
      return undefined;
    }
    lastFlashAt.current = now;

    setFlash(null);
    const frame = window.requestAnimationFrame(() => setFlash("change"));
    const timer = window.setTimeout(() => setFlash(null), 360);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [depthRank, price, size, total]);

  return flash;
}

function relativeDelta(previous: number, next: number) {
  const denominator = Math.max(Math.abs(previous), Math.abs(next), 0.00000001);
  return Math.abs(next - previous) / denominator;
}

function buildGroupingOptions(tickSize: number) {
  const seen = new Set<number>();
  return GROUPING_MULTIPLIERS.map((multiplier) => normalizeStep(tickSize * multiplier))
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .map((value) => ({
      value,
      label: `$${formatNumber(value, derivePrecision(value).priceDecimals)}`
    }));
}

function normalizeStep(value: number) {
  return Number(value.toFixed(8));
}
