import type { AccountSnapshot, Market, MarketSnapshot, Order, Trade } from "@reya/shared";
import type { CreateOrderInput } from "@reya/shared";
import { API_URL } from "./config";

interface ApiEnvelope<T> {
  data: T;
}

export async function getMarkets() {
  return fetchApi<Market[]>("/api/markets");
}

export async function getMarketSnapshot(symbol: string) {
  return fetchApi<MarketSnapshot>(`/api/markets/${symbol}/snapshot`);
}

export async function getAccountSnapshot() {
  return fetchApi<AccountSnapshot>("/api/account");
}

export async function placeOrder(input: CreateOrderInput) {
  return fetchApi<{ order: Order; trade?: Trade; account: AccountSnapshot }>("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function cancelOrder(orderId: string) {
  return fetchApi<{ order: Order; account: AccountSnapshot }>(`/api/orders/${orderId}`, {
    method: "DELETE"
  });
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed: ${response.status}`);
  }
  return (payload as ApiEnvelope<T>).data;
}
