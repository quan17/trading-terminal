import { PrismaClient } from "@prisma/client";
import { DEMO_ACCOUNT_ID, DEMO_MARKETS } from "../apps/api/src/market/defaults";

const prisma = new PrismaClient();

for (const market of DEMO_MARKETS) {
  await prisma.market.upsert({
    where: { symbol: market.symbol },
    update: {
      baseAsset: market.baseAsset,
      quoteAsset: market.quoteAsset,
      tickSize: market.tickSize,
      quantityStep: market.quantityStep,
      minOrderSize: market.minOrderSize
    },
    create: {
      id: market.id,
      symbol: market.symbol,
      baseAsset: market.baseAsset,
      quoteAsset: market.quoteAsset,
      tickSize: market.tickSize,
      quantityStep: market.quantityStep,
      minOrderSize: market.minOrderSize
    }
  });
}

await prisma.account.upsert({
  where: { id: DEMO_ACCOUNT_ID },
  update: {},
  create: {
    id: DEMO_ACCOUNT_ID,
    name: "Demo Account",
    cashBalance: 100_000
  }
});

await prisma.$disconnect();
