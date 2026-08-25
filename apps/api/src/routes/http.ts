import type { FastifyInstance } from "fastify";
import { createOrderSchema, marketSymbolSchema } from "@reya/shared";
import type { MarketSimulator } from "../market/simulator";
import type { TradingRepository } from "../repositories/types";
import type { TradingService } from "../services/tradingService";

export async function registerHttpRoutes(
  fastify: FastifyInstance,
  repository: TradingRepository,
  marketSimulator: MarketSimulator,
  tradingService: TradingService
) {
  fastify.get("/health", async () => ({
    status: "ok",
    persistence: repository.kind,
    timestamp: Date.now()
  }));

  fastify.get("/api/markets", async () => ({
    data: await repository.listMarkets()
  }));

  fastify.get("/api/markets/:symbol/snapshot", async (request, reply) => {
    const params = request.params as { symbol: string };
    const result = marketSymbolSchema.safeParse(params.symbol);
    if (!result.success) {
      return reply.status(400).send({ message: "Unsupported market symbol." });
    }
    return { data: marketSimulator.getSnapshot(result.data) };
  });

  fastify.get("/api/account", async () => ({
    data: await tradingService.getAccountSnapshot()
  }));

  fastify.get("/api/orders", async () => ({
    data: await repository.listOrders(100)
  }));

  fastify.get("/api/trades", async () => ({
    data: await repository.listTrades(100)
  }));

  fastify.get("/api/positions", async () => ({
    data: (await tradingService.getAccountSnapshot()).positions
  }));

  fastify.post("/api/orders", async (request, reply) => {
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid order.",
        issues: parsed.error.flatten()
      });
    }

    try {
      const result = await tradingService.placeOrder(parsed.data);
      return reply.status(201).send({ data: result });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ message: "Order submission failed." });
    }
  });

  fastify.delete("/api/orders/:orderId", async (request, reply) => {
    const params = request.params as { orderId: string };
    try {
      const result = await tradingService.cancelOrder(params.orderId);
      return { data: result };
    } catch {
      return reply.status(404).send({ message: "Order not found." });
    }
  });
}
