import { describe, expect, it } from "vitest";
import { applyDelta, applySnapshot, derivePrecision, mapToSortedLevels, prepareDepthRows } from "./utils";

describe("order book utilities", () => {
  it("applies price-level deltas to bid and ask maps", () => {
    const book = applySnapshot(
      [
        { price: 100, size: 2 },
        { price: 99, size: 4 }
      ],
      [{ price: 101, size: 1 }]
    );

    applyDelta(book, {
      bids: [
        { price: 100, size: 0 },
        { price: 98, size: 3 }
      ],
      asks: [{ price: 101, size: 2 }]
    });

    expect(mapToSortedLevels(book.bids, "bid")).toEqual([
      { price: 99, size: 4 },
      { price: 98, size: 3 }
    ]);
    expect(mapToSortedLevels(book.asks, "ask")).toEqual([{ price: 101, size: 2 }]);
  });

  it("prepares cumulative depth rows", () => {
    const rows = prepareDepthRows(
      [
        { price: 100, size: 1 },
        { price: 100.4, size: 2 },
        { price: 99, size: 3 }
      ],
      "bid",
      1,
      2
    );

    expect(rows).toEqual([
      { price: 100, size: 3, total: 3 },
      { price: 99, size: 3, total: 6 }
    ]);
  });

  it("groups ask prices upward so displayed liquidity does not understate the ask", () => {
    const rows = prepareDepthRows(
      [
        { price: 101.1, size: 1 },
        { price: 101.8, size: 2 },
        { price: 102.2, size: 4 }
      ],
      "ask",
      1,
      3
    );

    expect(rows).toEqual([
      { price: 102, size: 3, total: 3 },
      { price: 103, size: 4, total: 7 }
    ]);
  });

  it("derives display precision from the active price grouping", () => {
    expect(derivePrecision(1).priceDecimals).toBe(0);
    expect(derivePrecision(0.5).priceDecimals).toBe(1);
    expect(derivePrecision(0.01).priceDecimals).toBe(2);
  });
});
