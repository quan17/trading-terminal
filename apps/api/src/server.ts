import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { MarketSimulator } from "./market/simulator";
import type { TradingRepository } from "./repositories/types";
import { RealtimeHub } from "./services/realtimeHub";
import { TradingService } from "./services/tradingService";
import { registerHttpRoutes } from "./routes/http";
import { registerWsRoute } from "./routes/ws";

export async function buildServer(repository: TradingRepository) {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  const marketSimulator = new MarketSimulator(await repository.listMarkets());
  const realtimeHub = new RealtimeHub(() => marketSimulator.getMarkets());
  const tradingService = new TradingService(repository, marketSimulator, realtimeHub);

  marketSimulator.onEvent((event) => {
    realtimeHub.broadcast(event);
    if (event.type === "market.orderbook") {
      void tradingService.matchOpenOrdersForBook(event.data).catch((error: unknown) => {
        fastify.log.error({ error, symbol: event.data.symbol }, "Limit order matching failed");
      });
    }
  });

  await fastify.register(websocket);
  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"]
  });

  await registerHttpRoutes(fastify, repository, marketSimulator, tradingService);
  await registerWsRoute(fastify, realtimeHub, marketSimulator, tradingService);

  fastify.addHook("onReady", async () => {
    marketSimulator.start();
  });

  fastify.addHook("onClose", async () => {
    marketSimulator.stop();
    await repository.close();
  });

  return fastify;
}
