import type { FastifyInstance } from "fastify";
import type { RawData } from "ws";
import { wsClientMessageSchema } from "@reya/shared";
import type { MarketSimulator } from "../market/simulator";
import type { TradingService } from "../services/tradingService";
import type { RealtimeHub } from "../services/realtimeHub";

export async function registerWsRoute(
  fastify: FastifyInstance,
  hub: RealtimeHub,
  marketSimulator: MarketSimulator,
  tradingService: TradingService
) {
  fastify.get("/ws", { websocket: true }, async (socket) => {
    hub.addClient(socket);

    for (const market of marketSimulator.getMarkets()) {
      hub.send(socket, { type: "market.ticker", data: marketSimulator.getTicker(market.symbol) });
      hub.send(socket, { type: "market.orderbook", data: marketSimulator.getOrderBook(market.symbol) });
      const snapshot = marketSimulator.getSnapshot(market.symbol);
      for (const candle of snapshot.candles.slice(-120)) {
        hub.send(socket, { type: "market.candle", data: candle });
      }
      for (const trade of snapshot.trades.slice(0, 30)) {
        hub.send(socket, { type: "market.trade", data: trade });
      }
    }

    hub.send(socket, { type: "account.updated", data: await tradingService.getAccountSnapshot() });

    socket.on("message", (raw: RawData) => {
      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        hub.send(socket, { type: "error", message: "Invalid JSON payload." });
        return;
      }
      const parsed = wsClientMessageSchema.safeParse(message);
      if (!parsed.success) {
        hub.send(socket, { type: "error", message: "Invalid WebSocket message." });
        return;
      }
      if (parsed.data.type === "ping") {
        hub.send(socket, { type: "pong", timestamp: Date.now() });
      }
    });
  });
}
