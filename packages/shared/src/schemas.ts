import { z } from "zod";
import { MARKET_SYMBOLS } from "./domain";

export const marketSymbolSchema = z.enum(MARKET_SYMBOLS);
export const orderSideSchema = z.enum(["BUY", "SELL"]);
export const orderTypeSchema = z.enum(["MARKET", "LIMIT"]);

export const createOrderSchema = z
  .object({
    symbol: marketSymbolSchema,
    side: orderSideSchema,
    type: orderTypeSchema,
    price: z.number().positive().optional(),
    quantity: z.number().positive().max(1000),
    clientOrderId: z.string().min(8).max(80).optional()
  })
  .superRefine((value, ctx) => {
    if (value.type === "LIMIT" && !value.price) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "Limit orders require a price."
      });
    }
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const cancelOrderSchema = z.object({
  orderId: z.string().min(1)
});

export const wsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe"),
    symbols: z.array(marketSymbolSchema).min(1)
  }),
  z.object({
    type: z.literal("ping"),
    timestamp: z.number()
  })
]);
