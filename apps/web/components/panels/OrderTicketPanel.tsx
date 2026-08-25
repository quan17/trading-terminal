"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Crosshair, SendHorizonal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useFormState } from "react-hook-form";
import type { CreateOrderInput, OrderSide } from "@reya/shared";
import { createOrderSchema, formatNumber } from "@reya/shared";
import { placeOrder } from "../../lib/api";
import { useTradingStore } from "../../lib/tradingStore";
import { PanelShell } from "../ui/PanelShell";

const FEE_RATE = 0.0004;
const EPSILON = 0.00000001;

export function OrderTicketPanel() {
  const selectedSymbol = useTradingStore((state) => state.selectedSymbol);
  const book = useTradingStore((state) => state.orderBooks[selectedSymbol]);
  const account = useTradingStore((state) => state.account);
  const markets = useTradingStore((state) => state.markets);
  const [message, setMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      symbol: selectedSymbol,
      side: "BUY",
      type: "LIMIT",
      quantity: 0.01
    }
  });
  const { dirtyFields } = useFormState({ control: form.control });

  const side = form.watch("side");
  const quantity = Number(form.watch("quantity"));
  const limitPrice = Number(form.watch("price"));
  const market = useMemo(
    () => markets.find((item) => item.symbol === selectedSymbol),
    [markets, selectedSymbol]
  );
  const baseAsset = market?.baseAsset ?? selectedSymbol.split("-")[0] ?? "BASE";
  const quoteAsset = market?.quoteAsset ?? selectedSymbol.split("-")[1] ?? "USD";
  const quoteBalance = findBalance(account, quoteAsset);
  const baseBalance = findBalance(account, baseAsset);
  const referencePrice = useMemo(() => {
    if (!book) return undefined;
    return side === "BUY" ? book.bestAsk : book.bestBid;
  }, [book, side]);
  const estimatedPrice = limitPrice;
  const estimatedNotional =
    Number.isFinite(estimatedPrice ?? NaN) && Number.isFinite(quantity) ? Number(estimatedPrice) * quantity : 0;
  const estimatedFee = estimatedNotional * FEE_RATE;
  const estimatedQuote = side === "BUY" ? estimatedNotional + estimatedFee : Math.max(0, estimatedNotional - estimatedFee);
  const balanceError = useMemo(() => {
    if (!account) return "Account loading.";
    if (!Number.isFinite(quantity) || quantity <= 0) return "Enter a positive quantity.";
    if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
      return "Enter a valid limit price.";
    }
    if (side === "BUY") {
      if (!estimatedPrice || !Number.isFinite(estimatedPrice)) return "Waiting for market price.";
      const requiredQuote = estimatedNotional + estimatedFee;
      if (isGreaterThan(requiredQuote, quoteBalance.available)) {
        return `Insufficient ${quoteAsset}. Required $${formatNumber(requiredQuote, 2)}, available $${formatNumber(quoteBalance.available, 2)}.`;
      }
      return "";
    }
    if (isGreaterThan(quantity, baseBalance.available)) {
      return `Insufficient ${baseAsset}. Required ${formatNumber(quantity, 5)}, available ${formatNumber(baseBalance.available, 5)}.`;
    }
    return "";
  }, [
    account,
    baseAsset,
    baseBalance.available,
    estimatedFee,
    estimatedNotional,
    estimatedPrice,
    limitPrice,
    quantity,
    quoteAsset,
    quoteBalance.available,
    side
  ]);

  useEffect(() => {
    form.setValue("symbol", selectedSymbol);
    form.resetField("price");
  }, [form, selectedSymbol]);

  useEffect(() => {
    if (!referencePrice || dirtyFields.price) {
      return;
    }

    const current = Number(form.getValues("price"));
    if (!Number.isFinite(current) || current <= 0) {
      form.setValue("price", roundLimitPrice(referencePrice), {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: true
      });
    }
  }, [dirtyFields.price, form, referencePrice]);

  const selectSide = (nextSide: OrderSide) => {
    form.setValue("side", nextSide, { shouldDirty: true, shouldValidate: true });
    setMessage("");
  };

  const setLimitPriceFromReference = () => {
    if (!referencePrice) return;
    form.setValue("price", roundLimitPrice(referencePrice), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true
    });
  };

  const applySizePercent = (percent: number) => {
    const price = limitPrice || referencePrice;
    const rawQuantity =
      side === "BUY"
        ? price && price > 0
          ? (quoteBalance.available * percent) / (price * (1 + FEE_RATE))
          : 0
        : baseBalance.available * percent;
    const roundedQuantity = roundQuantityToStep(rawQuantity, market?.quantityStep ?? 0.00000001);
    form.setValue("quantity", roundedQuantity, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true
    });
    setMessage("");
  };

  const submit = form.handleSubmit(async (values) => {
    setIsSubmitting(true);
    setMessage("");
    try {
      const payload: CreateOrderInput = {
        ...values,
        symbol: selectedSymbol,
        type: "LIMIT",
        quantity: Number(values.quantity),
        price: Number(values.price),
        clientOrderId: `web_${Date.now()}_${Math.random().toString(16).slice(2)}`
      };
      const result = await placeOrder(payload);
      setMessage(
        result.order.status === "REJECTED" && result.order.rejectReason
          ? `Order rejected: ${result.order.rejectReason}`
          : `Order ${result.order.status.toLowerCase()}`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Order failed");
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <PanelShell
      title="Order Ticket"
      meta={referencePrice ? <span>${formatNumber(referencePrice, 2)}</span> : null}
      className="ticket-panel"
    >
      <form className="ticket-form" onSubmit={submit} data-testid="order-form">
        <div className="segmented">
          <SideButton current={side} value="BUY" onClick={() => selectSide("BUY")} />
          <SideButton current={side} value="SELL" onClick={() => selectSide("SELL")} />
        </div>

        <div className="ticket-fields limit">
          <label className="field">
            <span>Amount</span>
            <input
              type="number"
              step="0.001"
              min="0"
              {...form.register("quantity", { valueAsNumber: true })}
              data-testid="order-quantity"
            />
          </label>
          <label className="field">
            <span>Limit Price</span>
            <div className="price-input-row">
              <input
                type="number"
                step="0.01"
                min="0"
                {...form.register("price", { valueAsNumber: true })}
                data-testid="order-price"
              />
              <button
                type="button"
                className="peg-button"
                onClick={setLimitPriceFromReference}
                disabled={!referencePrice}
                title={`Use current ${side === "BUY" ? "best ask" : "best bid"}`}
              >
                <Crosshair size={14} />
                <span>Best</span>
              </button>
            </div>
          </label>
        </div>

        <div className="size-shortcuts" aria-label="Size shortcuts">
          {[0.25, 0.5, 0.75, 1].map((percent) => (
            <button
              key={percent}
              type="button"
              onClick={() => applySizePercent(percent)}
              disabled={side === "BUY" && (!estimatedPrice || !Number.isFinite(estimatedPrice))}
            >
              {percent === 1 ? "Max" : `${percent * 100}%`}
            </button>
          ))}
        </div>

        <div className="ticket-estimate" data-testid="ticket-estimate">
          <EstimateLine
            label={side === "BUY" ? "Est. Cost" : "Est. Receive"}
            value={estimatedQuote ? `$${formatNumber(estimatedQuote, 2)}` : "-"}
          />
          <EstimateLine label="Fee" value={estimatedFee ? `$${formatNumber(estimatedFee, 2)}` : "-"} />
        </div>

        <button
          type="submit"
          className={`submit-order ${side.toLowerCase()}`}
          disabled={isSubmitting || Boolean(balanceError)}
          data-testid="submit-order"
        >
          <SendHorizonal size={16} />
          <span>{isSubmitting ? "Submitting" : `${side} ${selectedSymbol}`}</span>
        </button>

        <div className="ticket-message" data-testid="order-message">
          {balanceError || message || form.formState.errors.quantity?.message || form.formState.errors.price?.message}
        </div>
      </form>
    </PanelShell>
  );
}

function roundLimitPrice(price: number) {
  return Number(price.toFixed(2));
}

function findBalance(account: ReturnType<typeof useTradingStore.getState>["account"], asset: string) {
  return (
    account?.balances.find((balance) => balance.asset === asset) ?? {
      asset,
      total: 0,
      reserved: 0,
      available: 0,
      usdValue: 0
    }
  );
}

function isGreaterThan(left: number, right: number) {
  return left - right > EPSILON;
}

function roundQuantityToStep(quantity: number, step: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }
  const safeStep = step > 0 ? step : 0.00000001;
  return Number((Math.floor(quantity / safeStep) * safeStep).toFixed(8));
}

function EstimateLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="ticket-estimate-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SideButton({ current, value, onClick }: { current: OrderSide; value: OrderSide; onClick: () => void }) {
  return (
    <button type="button" className={current === value ? value.toLowerCase() : ""} onClick={onClick}>
      {value}
    </button>
  );
}
