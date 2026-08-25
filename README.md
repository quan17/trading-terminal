# Reya Trading Terminal

Reviewer-friendly full-stack trading OA implementation for a small limit-order trading workflow. The demo path uses a single BTC-USD market, local simulated market data, an in-memory trading engine, and no authentication.

## Build Scope

- Single reviewer path centered on `BTC-USD`.
- Limit orders only for the required demo workflow.
- In-memory engine state; orders, trades, and account state reset on server restart.
- No exchange keys, containers, database server, or auth setup required.
- Local simulator drives ticker, candles, order book depth, and trade prints.

## What It Demonstrates

- Next.js + TypeScript trading UI.
- Golden Layout workspace with drag, dock, resize, maximize, restore, and persisted layouts.
- AG Grid tables for open orders, order history, trades, and portfolio-style account views.
- Fastify command/query routes plus a WebSocket stream for realtime market and order events.
- Limit order lifecycle: resting orders, crossing orders, partial fills, full fills, and cancellation.
- Order book visualization with cumulative totals, depth bars, spread indicator, row flash updates, and price grouping.
- Focused order ticket with editable limit price, fast sizing controls, and disabled submit for invalid orders.

## Architecture

```txt
apps/web
  Next.js terminal UI
  Golden Layout workspace
  Zustand realtime store
  TanStack Query bootstrap queries
  AG Grid tables
  lightweight-charts price chart

apps/api
  Fastify HTTP routes
  Fastify WebSocket route
  In-memory trading repository
  Limit order lifecycle service
  Local market simulator

packages/shared
  Domain types
  zod schemas
  order book utilities
```

## Project Documentation

- [Application Overview and Technical Design](docs/APP_OVERVIEW.md)
- [Decision Log](DECISION_LOG.md)

## Run Locally

Install dependencies:

```bash
pnpm install
```

Run the reviewer path with forced in-memory state:

```bash
USE_MEMORY_DB=true pnpm dev
```

Open:

```txt
http://localhost:3000
```

Local API endpoints:

```txt
http://localhost:4000
ws://localhost:4000/ws
```

## Demo Walkthrough

Use `BTC-USD` for the required path.

1. Submit a resting limit order.
   - In `Order Ticket`, choose `BUY` and `Limit`.
   - Enter a quantity such as `0.01`.
   - Enter a limit price below the current best ask so it does not cross immediately.
   - Submit and confirm the order appears in `Open Orders`.

2. Submit a crossing limit order.
   - Keep `Limit` selected.
   - Enter a buy price at or above the visible best ask.
   - For a visible partial-fill demo, use a quantity larger than the top ask size shown in the order book.
   - Submit and watch the order update, the trades feed print an execution, and any unfilled remainder stay open with `filledQuantity` populated.

3. Watch the full lifecycle.
   - If the order is partially filled, leave it open and wait for the simulator to publish another crossing book update.
   - Confirm the remaining quantity eventually fills and the order moves out of `Open Orders`.
   - Check `Order History` and `Trades` for the completed order and execution records.

4. Cancel an open order.
   - Place another passive limit order away from the spread.
   - Click cancel in `Open Orders`.
   - Confirm it leaves `Open Orders` and appears in `Order History` as canceled.

## Validation Commands

```bash
pnpm typecheck
pnpm test
pnpm build
```

The tests cover order book utilities and backend trading lifecycle behavior, including limit order reserves, repeated sell rejection, cancel reserve release, cash reserve settlement, and partial limit fills.

## Design Tradeoffs

- REST is used for initial queries and order commands because the command surface is small and explicit.
- WebSocket is used for ticker, candle, order book, trade, order, and account updates because those events are naturally streaming.
- The engine state is intentionally in memory for this exercise, keeping the project runnable as a standalone local program.
- Market data is simulated locally so the demo does not depend on external services, rate limits, or keys.
- Order book liveness is intentionally subtle: depth bars move continuously, while row flashes are throttled to meaningful near-spread changes.
