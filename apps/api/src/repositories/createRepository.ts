import { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../config";
import { InMemoryTradingRepository } from "./inMemoryRepository";
import { PrismaTradingRepository } from "./prismaRepository";
import type { TradingRepository } from "./types";

export async function createRepository(config: AppConfig): Promise<TradingRepository> {
  if (!config.databaseUrl || config.forceMemoryDb) {
    const repository = new InMemoryTradingRepository();
    await repository.seed();
    return repository;
  }

  try {
    const prisma = new PrismaClient();
    await prisma.$connect();
    const repository = new PrismaTradingRepository(prisma);
    await repository.seed();
    return repository;
  } catch (error) {
    console.warn("[api] Falling back to in-memory repository:", error);
    const repository = new InMemoryTradingRepository();
    await repository.seed();
    return repository;
  }
}
