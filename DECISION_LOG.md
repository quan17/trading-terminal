# Decision Log

This file is meant to help the follow-up discussion start quickly. It is not a full build journal; it captures the decisions I expect to talk through: scope, lifecycle modeling, realtime UI behavior, performance, and where I intentionally kept the system small.

## Quick Discussion Map

- Scope: single reviewer path, `BTC-USD`, limit-order workflow, in-memory runtime.
- Backend: order submission, resting orders, crossing execution plans, partial fills, cancellation, and account snapshots.
- Frontend: dockable trading workspace, efficient order ticket, readable order book, open-orders/history lifecycle.
- Realtime: REST for snapshots and commands, WebSocket for ticker/book/trade/order/account updates.
- Tradeoffs: local simulator over external exchange data, compact partial-fill model, subtle liveness over aggressive flashing.

## 2026-08-23 - Scope and Runtime Boundary

Decision: Keep the submitted build segment centered on a single `BTC-USD` limit-order workflow.

Why: The exercise rewards a small end-to-end implementation more than a broad exchange clone. Multi-symbol surfaces, auth, and many order types are interesting design topics, but they would make the submitted build look heavier than necessary.

Outcome: The reviewer path focuses on submit resting orders, submit crossing orders, observe fills in open orders/trades, and cancel an open order.

Decision: Make the local review path run with in-memory state via `USE_MEMORY_DB=true pnpm dev`.

Why: Reviewers should not need a database server, container, exchange key, or external market-data account to run the exercise.

Outcome: Orders, trades, account snapshots, candles, and books are locally generated or held in memory. State resets on server restart, which is acceptable for the exercise and makes the demo deterministic enough to review.

Decision: Use REST for command/query and WebSocket for realtime updates.

Why: Order submission/cancel and initial snapshots are simple request-response operations. Market data and order/account changes are streaming events.

Outcome: The API remains easy to inspect, while the UI stays live through WebSocket updates.

## 2026-08-23 - Trading Lifecycle Model

Decision: Represent partial fills as `status: OPEN` with `filledQuantity > 0`, instead of adding a separate `PARTIALLY_FILLED` status.

Why: This keeps the state machine compact while still making partial execution visible in the UI, tests, and account updates.

Outcome: Each execution updates `filledQuantity`, creates a trade, broadcasts account/order updates, and leaves any remainder open until it fills or is canceled.

Decision: Build a crossing execution plan from visible book levels.

Why: A crossing limit order may not be fully executable at the top level. The engine should fill only the quantity available at crossed levels and keep the rest working.

Outcome: The backend can demonstrate resting orders, crossing orders, partial fills, full fills, and cancellation without building a production matching engine.

## 2026-08-24 - Frontend Product and UX Decisions

Decision: Use Golden Layout for a dockable terminal workspace.

Why: Trading UIs are workspace-driven. Reviewers should be able to resize, maximize, drag, dock, restore, and persist panels.

Outcome: Components are internally closable so drag/drop works, but close icons are hidden to avoid accidental panel removal.

Decision: Keep the order ticket focused on limit-order entry.

Why: The original scope is limit orders only. The ticket should prioritize speed and trader control, not show every account detail inline.

Outcome: Limit price is editable, a small "Best" action can peg from bid/ask, sizing shortcuts are available, and invalid submissions are disabled.

Decision: Let the open-orders panel fall back to recent history when there are no working orders.

Why: After a fill or cancellation, an empty open-orders grid hides useful lifecycle context.

Outcome: Open orders remain the primary view, but the panel shows recent order history with a clear status message when no orders are working.

## 2026-08-24 - Order Book Visualization and Performance

Decision: Add cumulative totals, depth bars, spread display, and price grouping to the order book.

Why: A real trading book should communicate liquidity visually, not just render price and size text.

Outcome: The order book can show market depth, spread percentage, grouped price levels, and realtime liquidity changes.

Decision: Keep order book liveness subtle.

Why: The first row-flash implementation proved realtime updates, but too much flashing created visual noise and made the book uncomfortable to scan.

Outcome: Initial render does not flash. Only near-spread rows with material size changes can flash, each row has a cooldown, the animation is short and low-opacity, and reduced-motion users can avoid the animation.

Decision: Split order book rows and pass primitive props.

Why: Frequent WebSocket updates can cause excessive React work if the whole book re-renders for every update.

Outcome: Row memoization keeps rendering focused on rows whose price/size/total actually changed.

## 2026-08-24 - AI Tooling Usage

Decision: Use AI tooling as an implementation accelerator, but keep the engineering decisions explicit.

How it helped:

- Interpreted the OA requirements and kept the README aligned with the requested scope.
- Generated focused implementation drafts for React panels, trading lifecycle code, and tests.
- Helped iterate on UX concerns such as order-ticket density, responsive layout, Golden Layout drag/drop, and order-book flash intensity.
- Assisted with refactoring names/types so the code reads cleanly for review.

Human review points:

- I selected the scope and tech stack.
- I validated behavior through local runs, browser inspection, typecheck, tests, and production build.
- I adjusted documentation so reviewers can quickly understand what is intentionally in scope and what is not.

## Final Validation

Before submission, the project was validated with:

```bash
pnpm typecheck
pnpm test
pnpm build
```

The repository was pushed to:

```txt
https://github.com/quan17/trading-terminal
```
