import type { OrderBookLevel } from "../domain";

export function applySnapshot(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[]
): { bids: Map<number, number>; asks: Map<number, number> } {
  return {
    bids: levelsToMap(bids),
    asks: levelsToMap(asks)
  };
}

export function applyDelta(
  current: { bids: Map<number, number>; asks: Map<number, number> },
  delta: { bids?: OrderBookLevel[]; asks?: OrderBookLevel[] }
) {
  applySideDelta(current.bids, delta.bids ?? []);
  applySideDelta(current.asks, delta.asks ?? []);
}

export function mapToSortedLevels(
  levels: Map<number, number>,
  side: "bid" | "ask",
  limit = Number.POSITIVE_INFINITY
): OrderBookLevel[] {
  return Array.from(levels.entries())
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price))
    .slice(0, limit);
}

export function groupByPriceBucket(levels: OrderBookLevel[], bucket: number, side: "bid" | "ask" = "bid"): OrderBookLevel[] {
  if (!Number.isFinite(bucket) || bucket <= 0) {
    return [...levels];
  }

  const grouped = new Map<number, number>();
  for (const level of levels) {
    const key = normalizeBucketPrice((side === "ask" ? Math.ceil(level.price / bucket) : Math.floor(level.price / bucket)) * bucket);
    grouped.set(key, (grouped.get(key) ?? 0) + level.size);
  }

  return Array.from(grouped.entries()).map(([price, size]) => ({ price, size }));
}

export function prepareDepthRows(
  levels: OrderBookLevel[],
  side: "bid" | "ask",
  bucket: number,
  maxLevels = 16
): OrderBookLevel[] {
  let runningTotal = 0;
  return groupByPriceBucket(levels, bucket, side)
    .sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price))
    .slice(0, maxLevels)
    .map((level) => {
      runningTotal += level.size;
      return { ...level, total: runningTotal };
    });
}

export function derivePrecision(bucket: number): { priceDecimals: number; sizeDecimals: number } {
  if (bucket >= 1) return { priceDecimals: getDecimalPlaces(bucket), sizeDecimals: 4 };
  return { priceDecimals: Math.min(4, getDecimalPlaces(bucket)), sizeDecimals: 5 };
}

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
}

function levelsToMap(levels: OrderBookLevel[]) {
  const map = new Map<number, number>();
  for (const level of levels) {
    if (level.size > 0) {
      map.set(level.price, level.size);
    }
  }
  return map;
}

function normalizeBucketPrice(value: number) {
  return Number(value.toFixed(8));
}

function getDecimalPlaces(value: number) {
  if (!Number.isFinite(value)) return 2;
  const [, decimals = ""] = value.toString().split(".");
  return Math.min(4, decimals.length);
}

function applySideDelta(levels: Map<number, number>, delta: OrderBookLevel[]) {
  for (const level of delta) {
    if (level.size <= 0) {
      levels.delete(level.price);
    } else {
      levels.set(level.price, level.size);
    }
  }
}
