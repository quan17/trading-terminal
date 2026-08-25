# Reya Trading Terminal Overview

Reya Trading Terminal is a full-stack TypeScript trading OA project. The reviewer-facing build segment is intentionally small: one primary market path, limit-order submission, realtime order book/trade updates, partial fill handling, cancellation, and an in-memory engine that runs locally without external services.

The UI includes several trading-terminal affordances to demonstrate frontend depth, but the documented demo path stays focused on the required limit-order lifecycle.

## Scope Alignment

The required build path is:

- `BTC-USD` as the primary reviewer market.
- Limit order entry and cancellation.
- Resting order visibility.
- Crossing order execution.
- Partial fill visibility in open orders and trades.
- In-memory state for orders, trades, and account snapshots.
- No authentication.
- No required container, database server, exchange key, or third-party data service.

The app has richer visual panels for the trading-terminal experience, but those panels support the above path rather than expanding the submitted scope into a large multi-market product.

## Product Surface

### Trading Workspace

- Golden Layout powers a dockable terminal workspace.
- Panels can be resized, maximized, dragged, docked, and reordered.
- Layout changes are stored in `localStorage` and can be reset.
- Close icons are hidden while components remain internally closable, which preserves Golden Layout drag behavior without making accidental panel removal easy.

### Market Data Visualization

- A local simulator emits ticker, candle, order book, and trade-print updates.
- The price chart uses `lightweight-charts`.
- A market scorecard summarizes current price context, spread, depth, range, and volume-style metrics.
- The order book shows bid/ask depth with cumulative totals and row-level depth bars.
- A center spread indicator displays absolute spread and spread percentage.
- Price grouping lets the user aggregate displayed levels by tick bucket.
- Near-spread rows flash briefly on material size changes, making WebSocket liveness visible without turning the full book into visual noise.

### Order Entry

- The order ticket is optimized for fast limit-order entry.
- Limit price is editable and can be pegged from the current best bid/ask when helpful.
- Submit is disabled when the requested quantity or quote value cannot be accepted.
- The ticket keeps detailed account information out of the main order path; the account panel carries that context.

### Orders, Trades, and Account View

- Open orders and order history are separate tabs so active liquidity remains easy to scan.
- When there are no open orders, the open-orders panel falls back to recent order history instead of showing a dead empty grid.
- Partially filled limit orders remain in open orders with `filledQuantity` populated.
- Filled and canceled orders move to history.
- The trade feed shows execution prints from both the market simulator and user order fills.
- The account area shows enough total, reserved, and available state to explain why a limit order can or cannot be submitted.

## Limit Order Lifecycle

1. A passive limit order is accepted and appears in `Open Orders`.
2. A crossing limit order or a later crossing book update creates an execution plan.
3. The engine fills up to the executable quantity available at crossed price levels.
4. If only part of the order is executable, the order remains `OPEN` with updated `filledQuantity`.
5. Each execution creates a trade record and broadcasts order, trade, and account updates over WebSocket.
6. When all quantity is filled, the order leaves `Open Orders` and appears in `Order History`.
7. Canceling an open order moves it to history and releases the remaining reserved amount.

Partial fill state is represented as `status: OPEN` plus `filledQuantity > 0`. That keeps the domain model small while still making partial execution visible in the UI and tests.

## Architecture

```txt
apps/web
  Next.js + React terminal UI
  Golden Layout workspace shell
  Zustand realtime store
  TanStack Query bootstrap queries
  AG Grid order/trade/account tables
  lightweight-charts price chart

apps/api
  Fastify HTTP command/query routes
  Fastify WebSocket route
  In-memory repository
  Trading lifecycle service
  Local market simulator

packages/shared
  Domain types
  zod request schemas
  order book aggregation utilities
```

## Tech Choices by Feature

| Feature | Tech | Why |
| --- | --- | --- |
| Full-stack workspace | TypeScript monorepo with pnpm workspaces | Shared types and validation across UI, API, and tests. |
| Frontend app | Next.js + React | Fast local development and clear component boundaries. |
| Dockable terminal layout | Golden Layout | Trading UIs need resize, drag, dock, maximize, and restore behavior. |
| Dense tabular views | AG Grid | Open orders, history, trades, and account rows need scanning-friendly tables. |
| Financial chart | lightweight-charts | Efficient canvas charting with a trading-native API. |
| Realtime client state | Zustand | Lightweight store for WebSocket-fed book, ticker, trades, orders, and account snapshots. |
| Bootstrap queries | TanStack Query | Simple cache and loading behavior for initial snapshots. |
| Backend | Fastify | Small TypeScript server with HTTP and WebSocket support. |
| Runtime state | In-memory repository | Matches the exercise constraint and keeps the app standalone. |
| Validation | zod | Shared schema validation for order submission. |
| Testing | Vitest | Fast coverage for lifecycle and order book logic. |
| Browser validation | Playwright scripts | Useful for responsive layout, drag/drop, and screenshot demos. |

## Why REST Plus WebSocket

The app has a clean split:

- REST handles snapshot queries and order commands.
- WebSocket handles market ticks, order book snapshots, trade prints, order updates, and account updates.

GraphQL would add schema and subscription complexity without improving the core OA workflow.

## Key Concerns and Solutions

### Concern: The Project Can Look Too Big

The original build segment is deliberately small. A trading terminal can easily drift into authentication, durable storage, many symbols, and many order types.

Solution:

- The README and demo path focus on limit orders only.
- The default review command forces in-memory state.
- The documented path uses `BTC-USD`.
- Extra visual panels are presented as supporting UI, not as expanded backend scope.

### Concern: Limit Price Must Be Trader-Controlled

A trader must be able to type a target limit price instead of having the ticket constantly overwrite it with the current market price.

Solution:

- Limit price is an editable field.
- A small peg action can copy the current best price when the user wants it.
- The app does not overwrite a dirty price input.

### Concern: Partial Fills Must Be Visible

The required demo asks reviewers to see a partial fill in the book and trades feed.

Solution:

- The backend calculates executable quantity from crossed book levels.
- If crossed liquidity is smaller than remaining order quantity, the order stays open.
- `filledQuantity`, trade prints, and account updates are broadcast after each partial execution.

### Concern: Realtime Order Books Can Re-render Too Much

Frequent WebSocket updates can make a React order book noisy and expensive.

Solution:

- Order book rows are memoized.
- Rows receive primitive props so unchanged rows can skip render work.
- Depth width is driven by CSS variables.
- Short-lived row flash classes communicate liveness without maintaining heavy animation state.

### Concern: Realtime Feedback Can Become Visual Noise

An order book should feel alive, but aggressive row flashing can make a trader's eyes chase the entire table instead of the spread and top-of-book liquidity.

Solution:

- Initial render does not flash, so loading a book is calm.
- Only rows close to the spread are eligible for flash feedback.
- Small size changes are absorbed by the depth bar transition without a full-row highlight.
- Each row has a cooldown before it can flash again.
- Flash opacity and duration are intentionally subtle.
- `prefers-reduced-motion` is respected for users who want less animation.

### Concern: Workspace Drag/Drop Must Actually Work

Golden Layout needs components to be internally removable for drag-out docking to work correctly.

Solution:

- Components are internally closable.
- Close icons are hidden with CSS.
- Saved layouts are normalized before restore.
- ResizeObserver and viewport events keep the layout filling the available screen.

## Reviewer Demo Script

1. Start the app:

   ```bash
   USE_MEMORY_DB=true pnpm dev
   ```

2. Open:

   ```txt
   http://localhost:3000
   ```

3. Submit resting orders:
   - Use `BTC-USD`.
   - Select `BUY` and `Limit`.
   - Enter a small quantity such as `0.01`.
   - Enter a price below the current best ask.
   - Confirm the order appears in `Open Orders`.

4. Submit a crossing order:
   - Keep `Limit` selected.
   - Enter a price equal to the current best ask for a buy, or equal to the best bid for a sell after holding the asset.
   - Use a quantity larger than the visible top level if you want a partial fill.
   - Confirm an execution appears in `Trades` and the open order updates with its filled quantity.

5. Watch completion:
   - Leave any remainder open.
   - Let later simulator updates cross the remaining order.
   - Confirm the order moves from `Open Orders` to `Order History` after it is filled.

6. Cancel an order:
   - Place another passive limit order away from the spread.
   - Cancel it from `Open Orders`.
   - Confirm it appears in `Order History` as canceled.

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
```

Current backend tests cover resting limit orders, marketable limit orders, passive sell fills, partial limit fills, reserve behavior, cancel release, and settlement after fills.

## Current Limitations

- Single demo account.
- No authentication.
- No real exchange adapter.
- No production matching engine with multi-account priority queues.
- Market data is simulated and ephemeral.
- Runtime state is reset on server restart.
