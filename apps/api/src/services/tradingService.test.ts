import type { AccountSnapshot, MarketSymbol, OrderBookSnapshot, WsServerEvent } from "@reya/shared";
import { describe, expect, it, vi } from "vitest";
import { DEMO_MARKETS } from "../market/defaults";
import { MarketSimulator } from "../market/simulator";
import { InMemoryTradingRepository } from "../repositories/inMemoryRepository";
import { RealtimeHub } from "./realtimeHub";
import { calculateNextPosition, TradingService } from "./tradingService";

describe("TradingService order lifecycle", () => {
  it("keeps a passive buy limit open until the book crosses it", async () => {
    const { events, repository, service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    const submission = await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "LIMIT",
      quantity: 0.01,
      price: 64_200
    });

    expect(submission.order.status).toBe("OPEN");
    expect(await repository.listTrades()).toHaveLength(0);

    const restingExecutions = await service.matchOpenOrdersForBook(makeOrderBook("BTC-USD", 64_210, 64_220));
    expect(restingExecutions).toHaveLength(0);

    events.length = 0;
    const crossedExecutions = await service.matchOpenOrdersForBook(makeOrderBook("BTC-USD", 64_180, 64_190));
    const orders = await repository.listOrders();
    const trades = await repository.listTrades();
    const account = await service.getAccountSnapshot();

    expect(crossedExecutions).toHaveLength(1);
    expect(orders[0]?.status).toBe("FILLED");
    expect(orders[0]?.filledQuantity).toBe(0.01);
    expect(orders[0]?.avgFillPrice).toBe(64_190);
    expect(trades[0]?.price).toBe(64_190);
    expect(account.positions[0]?.quantity).toBe(0.01);
    expect(account.positions[0]?.avgEntryPrice).toBe(64_190);
    expect(events.map((event) => event.type)).toEqual(["order.updated", "trade.execution", "account.updated"]);
  });

  it("partially fills a passive limit order and leaves the remainder open", async () => {
    const { repository, service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    const submission = await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "LIMIT",
      quantity: 0.01,
      price: 64_225
    });

    expect(submission.order.status).toBe("OPEN");
    expect(submission.order.filledQuantity).toBe(0);

    const partial = await service.matchOpenOrdersForBook(
      makeOrderBook("BTC-USD", 64_210, 64_220, { askSize: 0.004 })
    );
    const partiallyFilledOrder = partial[0]?.order;
    const openOrdersAfterPartial = await repository.listOpenOrders("BTC-USD");

    expect(partial).toHaveLength(1);
    expect(partiallyFilledOrder?.status).toBe("OPEN");
    expect(partiallyFilledOrder?.filledQuantity).toBe(0.004);
    expect(partial[0]?.trade?.quantity).toBe(0.004);
    expect(openOrdersAfterPartial[0]?.filledQuantity).toBe(0.004);
    expect(getBalance(partial[0]!.account, "BTC").total).toBe(0.004);
    expect(getBalance(partial[0]!.account, "USD").reserved).toBeCloseTo(385.50414, 8);

    const completed = await service.matchOpenOrdersForBook(
      makeOrderBook("BTC-USD", 64_210, 64_220, { askSize: 0.006 })
    );
    const trades = await repository.listTrades();

    expect(completed).toHaveLength(1);
    expect(completed[0]?.order.status).toBe("FILLED");
    expect(completed[0]?.order.filledQuantity).toBe(0.01);
    expect(completed[0]?.order.avgFillPrice).toBe(64_220);
    expect(completed[0]?.trade?.quantity).toBe(0.006);
    expect(trades).toHaveLength(2);
    expect(await repository.listOpenOrders("BTC-USD")).toHaveLength(0);
    expect(getBalance(completed[0]!.account, "BTC").total).toBe(0.01);
    expect(getBalance(completed[0]!.account, "USD").reserved).toBe(0);
  });

  it("fills a marketable limit immediately at the current top of book", async () => {
    const { repository, service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    const submission = await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "LIMIT",
      quantity: 0.01,
      price: 65_000
    });

    const trades = await repository.listTrades();

    expect(submission.order.status).toBe("FILLED");
    expect(submission.order.avgFillPrice).toBe(64_250);
    expect(submission.trade?.price).toBe(64_250);
    expect(trades[0]?.price).toBe(64_250);
    expect(await repository.listOpenOrders("BTC-USD")).toHaveLength(0);
  });

  it("fills a passive sell limit when the bid crosses a held position", async () => {
    const { repository, service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "MARKET",
      quantity: 0.01
    });
    const submission = await service.placeOrder({
      symbol: "BTC-USD",
      side: "SELL",
      type: "LIMIT",
      quantity: 0.01,
      price: 64_300
    });

    expect(submission.order.status).toBe("OPEN");

    const crossedExecutions = await service.matchOpenOrdersForBook(makeOrderBook("BTC-USD", 64_310, 64_320));
    const trades = await repository.listTrades();
    const account = await service.getAccountSnapshot();

    expect(crossedExecutions).toHaveLength(1);
    expect(crossedExecutions[0]?.order.status).toBe("FILLED");
    expect(trades.find((trade) => trade.side === "SELL")?.price).toBe(64_310);
    expect(account.positions[0]?.quantity).toBe(0);
    expect(account.positions[0]?.avgEntryPrice).toBe(0);
    expect(account.positions[0]?.realizedPnl).toBe(0.6);
  });
});

describe("TradingService trader behavior demos", () => {
  it("Momentum taker: crosses the spread to enter and flatten quickly", async () => {
    const { service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    const entry = await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "LIMIT",
      quantity: 0.01,
      price: 65_000
    });
    const exit = await service.placeOrder({
      symbol: "BTC-USD",
      side: "SELL",
      type: "LIMIT",
      quantity: 0.01,
      price: 64_000
    });
    const account = await service.getAccountSnapshot();

    expect(entry.order.status).toBe("FILLED");
    expect(entry.trade?.price).toBe(64_250);
    expect(exit.order.status).toBe("FILLED");
    expect(exit.trade?.price).toBe(64_240);
    expect(account.positions[0]?.quantity).toBe(0);
    expect(account.positions[0]?.realizedPnl).toBe(-0.1);
  });

  it("Pullback maker: rests a bid below market and lets a later tick fill it", async () => {
    const { repository, service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    const order = await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "LIMIT",
      quantity: 0.01,
      price: 64_225
    });
    const waitingOrders = await repository.listOpenOrders("BTC-USD");
    const executions = await service.matchOpenOrdersForBook(makeOrderBook("BTC-USD", 64_210, 64_220));

    expect(order.order.status).toBe("OPEN");
    expect(waitingOrders).toHaveLength(1);
    expect(executions[0]?.order.status).toBe("FILLED");
    expect(executions[0]?.trade?.price).toBe(64_220);
    expect(await repository.listOpenOrders("BTC-USD")).toHaveLength(0);
  });

  it("Stale quote cancel: removes a resting ask before the market trades through it", async () => {
    const { repository, service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "MARKET",
      quantity: 0.01
    });
    const order = await service.placeOrder({
      symbol: "BTC-USD",
      side: "SELL",
      type: "LIMIT",
      quantity: 0.01,
      price: 64_320
    });
    const canceled = await service.cancelOrder(order.order.id);
    const executions = await service.matchOpenOrdersForBook(makeOrderBook("BTC-USD", 64_330, 64_340));

    expect(order.order.status).toBe("OPEN");
    expect(canceled.order.status).toBe("CANCELED");
    expect(executions).toHaveLength(0);
    expect(await repository.listTrades()).toHaveLength(1);
    expect(await repository.listOpenOrders("BTC-USD")).toHaveLength(0);
  });
});

describe("TradingService spot-mode reserves", () => {
  it("market sell without holdings rejected", async () => {
    const { repository, service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    const result = await service.placeOrder({
      symbol: "BTC-USD",
      side: "SELL",
      type: "MARKET",
      quantity: 0.01
    });

    expect(result.order.status).toBe("REJECTED");
    expect(result.order.rejectReason).toContain("Insufficient available BTC");
    expect(await repository.listTrades()).toHaveLength(0);
    expect(getBalance(result.account, "BTC").available).toBe(0);
  });

  it("limit sell reserves BTC", async () => {
    const { service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "MARKET",
      quantity: 0.02
    });
    const result = await service.placeOrder({
      symbol: "BTC-USD",
      side: "SELL",
      type: "LIMIT",
      quantity: 0.01,
      price: 99_999
    });
    const btc = getBalance(result.account, "BTC");

    expect(result.order.status).toBe("OPEN");
    expect(btc.total).toBe(0.02);
    expect(btc.reserved).toBe(0.01);
    expect(btc.available).toBe(0.01);
  });

  it("second sell rejected when the held BTC is already reserved", async () => {
    const { repository, service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "MARKET",
      quantity: 0.01
    });
    await service.placeOrder({
      symbol: "BTC-USD",
      side: "SELL",
      type: "LIMIT",
      quantity: 0.01,
      price: 99_999
    });
    const second = await service.placeOrder({
      symbol: "BTC-USD",
      side: "SELL",
      type: "LIMIT",
      quantity: 0.01,
      price: 99_998
    });

    expect(second.order.status).toBe("REJECTED");
    expect(second.order.rejectReason).toContain("Insufficient available BTC");
    expect(await repository.listOpenOrders("BTC-USD")).toHaveLength(1);
    expect(getBalance(second.account, "BTC").available).toBe(0);
  });

  it("cancel releases reserve", async () => {
    const { service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "MARKET",
      quantity: 0.01
    });
    const sell = await service.placeOrder({
      symbol: "BTC-USD",
      side: "SELL",
      type: "LIMIT",
      quantity: 0.01,
      price: 99_999
    });
    expect(getBalance(sell.account, "BTC").reserved).toBe(0.01);

    const canceled = await service.cancelOrder(sell.order.id);
    const btc = getBalance(canceled.account, "BTC");

    expect(canceled.order.status).toBe("CANCELED");
    expect(btc.reserved).toBe(0);
    expect(btc.available).toBe(0.01);
  });

  it("limit buy reserves cash", async () => {
    const { service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    const result = await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "LIMIT",
      quantity: 0.1,
      price: 60_000
    });
    const usd = getBalance(result.account, "USD");

    expect(result.order.status).toBe("OPEN");
    expect(usd.total).toBe(100_000);
    expect(usd.reserved).toBe(6_002.4);
    expect(usd.available).toBe(93_997.6);
  });

  it("fill settles reserve correctly", async () => {
    const { service } = await createServiceHarness(makeOrderBook("BTC-USD", 64_240, 64_250));

    const order = await service.placeOrder({
      symbol: "BTC-USD",
      side: "BUY",
      type: "LIMIT",
      quantity: 0.1,
      price: 64_225
    });
    const reservedCash = getBalance(order.account, "USD").reserved;

    const executions = await service.matchOpenOrdersForBook(makeOrderBook("BTC-USD", 64_210, 64_220));
    const account = executions[0]?.account;

    expect(reservedCash).toBe(6_425.069);
    expect(executions).toHaveLength(1);
    expect(account).toBeDefined();
    expect(getBalance(account!, "USD").reserved).toBe(0);
    expect(getBalance(account!, "USD").total).toBeCloseTo(93_575.4312, 8);
    expect(getBalance(account!, "USD").available).toBeCloseTo(93_575.4312, 8);
    expect(getBalance(account!, "BTC").total).toBe(0.1);
    expect(account!.positions[0]?.avgEntryPrice).toBe(64_220);
  });
});

describe("calculateNextPosition", () => {
  it("averages into a long position", () => {
    expect(
      calculateNextPosition({
        currentQuantity: 1,
        currentAvgEntryPrice: 100,
        currentRealizedPnl: 0,
        side: "BUY",
        fillPrice: 120,
        fillQuantity: 1
      })
    ).toEqual({
      quantity: 2,
      avgEntryPrice: 110,
      realizedPnl: 0
    });
  });

  it("realizes pnl when reducing a long position", () => {
    expect(
      calculateNextPosition({
        currentQuantity: 2,
        currentAvgEntryPrice: 100,
        currentRealizedPnl: 0,
        side: "SELL",
        fillPrice: 125,
        fillQuantity: 0.5
      })
    ).toEqual({
      quantity: 1.5,
      avgEntryPrice: 100,
      realizedPnl: 12.5
    });
  });

  it("flips from long to short and resets entry price", () => {
    expect(
      calculateNextPosition({
        currentQuantity: 1,
        currentAvgEntryPrice: 100,
        currentRealizedPnl: 0,
        side: "SELL",
        fillPrice: 90,
        fillQuantity: 2
      })
    ).toEqual({
      quantity: -1,
      avgEntryPrice: 90,
      realizedPnl: -10
    });
  });
});

async function createServiceHarness(orderBook: OrderBookSnapshot) {
  const repository = new InMemoryTradingRepository();
  await repository.seed();

  const simulator = new MarketSimulator(DEMO_MARKETS);
  vi.spyOn(simulator, "getOrderBook").mockImplementation((symbol) => {
    if (symbol === orderBook.symbol) {
      return orderBook;
    }
    return makeOrderBook(symbol, 100, 101);
  });
  vi.spyOn(simulator, "getExecutionPrice").mockImplementation((symbol, side) => {
    const book = symbol === orderBook.symbol ? orderBook : makeOrderBook(symbol, 100, 101);
    return side === "BUY" ? book.bestAsk : book.bestBid;
  });

  const events: WsServerEvent[] = [];
  const hub = new RealtimeHub(() => DEMO_MARKETS);
  vi.spyOn(hub, "broadcast").mockImplementation((event) => {
    events.push(event);
  });

  return {
    events,
    repository,
    service: new TradingService(repository, simulator, hub)
  };
}

function makeOrderBook(
  symbol: MarketSymbol,
  bestBid: number,
  bestAsk: number,
  options: { bidSize?: number; askSize?: number } = {}
): OrderBookSnapshot {
  return {
    symbol,
    sequence: 1,
    timestamp: Date.now(),
    bids: [{ price: bestBid, size: options.bidSize ?? 10 }],
    asks: [{ price: bestAsk, size: options.askSize ?? 10 }],
    bestBid,
    bestAsk,
    mid: (bestBid + bestAsk) / 2,
    spread: bestAsk - bestBid
  };
}

function getBalance(account: AccountSnapshot, asset: string) {
  const balance = account.balances.find((item) => item.asset === asset);
  if (!balance) {
    throw new Error(`Missing ${asset} balance`);
  }
  return balance;
}
