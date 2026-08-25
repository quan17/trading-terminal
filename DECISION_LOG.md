# Decision Log

This file records the main implementation decisions for the Reya Trading Terminal OA. It is intentionally kept in the repository root so reviewers can use it during follow-up discussion.

## 2026-08-25 - Keep the Reviewer Path Small

Decision: The documented build path is a single-market, limit-order workflow centered on `BTC-USD`.

Why: The exercise values a small end-to-end system over a broad trading surface.

Outcome: README and demo instructions focus on limit order submit, rest, cross, partial fill, trade feed update, and cancel. Extra UI panels support that path but are not presented as separate product scope.

## 2026-08-25 - Force In-Memory Runtime for Review

Decision: The reviewer command is `USE_MEMORY_DB=true pnpm dev`.

Why: The engine should run as a standalone local program without requiring a pre-installed database, container, exchange key, or external data service.

Outcome: Orders, trades, and account snapshots reset on server restart. This makes review reproducible and keeps setup friction low.

## 2026-08-25 - Use REST for Commands and WebSocket for Streams

Decision: Use Fastify HTTP routes for snapshots and order commands, and WebSocket for market/order/account events.

Why: The app has a simple command/query boundary plus frequent realtime updates. GraphQL subscriptions would add complexity without improving the required workflow.

Outcome: The UI bootstraps with HTTP, then stays live through WebSocket events for ticker, candles, book snapshots, trade prints, order updates, and account updates.

## 2026-08-25 - Represent Partial Fill Without a New Status

Decision: A partially filled order remains `OPEN` with `filledQuantity > 0`.

Why: This keeps the domain model compact while still exposing partial execution clearly in open orders, trades, and tests.

Outcome: Each execution updates `filledQuantity`, emits a trade, and leaves the remaining quantity open until it is filled or canceled.

## 2026-08-25 - Simulate Local Market Data

Decision: Generate ticker, candles, book depth, and trade prints locally.

Why: External market data would add API keys, rate limits, flaky network dependencies, and reviewer setup risk.

Outcome: The UI can demonstrate realtime liveness, order book depth bars, spread updates, and partial fills without relying on third-party services.

## 2026-08-25 - Optimize Order Book Rendering at Row Level

Decision: Split order book rows and pass primitive props so unchanged rows can skip render work.

Why: Order books update frequently; repainting the whole panel for every size change would make the UI feel less professional.

Outcome: Depth bars, spread, grouping, and row flashes update live while keeping React work bounded.

## 2026-08-25 - Keep Order Book Liveness Subtle

Decision: Throttle and soften order book flash feedback.

Why: The first version flashed every changed row on nearly every simulated book update. That proved realtime liveness, but it also created visual noise and made the book less comfortable to scan.

Outcome: Initial render does not flash. Only near-spread rows with material size changes can flash, each row has a cooldown, the animation is short and low-opacity, and reduced-motion users can avoid the animation.

## 2026-08-25 - Fall Back From Empty Open Orders to History

Decision: Show recent order history inside the open-orders panel when there are no working orders.

Why: A trader usually wants to confirm what just happened after a fill or cancel. An empty open-orders grid hides that lifecycle context and feels like lost information.

Outcome: Open orders remain the priority view, but the panel falls back to recent history with a status message when there are no open orders.

## 2026-08-25 - Hide Golden Layout Close Icons, Not Closability

Decision: Keep Golden Layout components internally closable but hide close controls in CSS.

Why: Golden Layout drag-out behavior depends on closability. Making panels non-closable blocked real drag/drop.

Outcome: Reviewers can drag, dock, resize, maximize, restore, and persist the workspace without accidentally closing panels.
