"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { Order } from "@reya/shared";
import { formatNumber } from "@reya/shared";
import { cancelOrder } from "../../lib/api";
import { EMPTY_ORDERS } from "../../lib/empty";
import { useTradingStore } from "../../lib/tradingStore";
import { DataGrid } from "../ui/DataGrid";
import { PanelShell } from "../ui/PanelShell";

export function OpenOrdersPanel() {
  const orders = useTradingStore((state) => state.account?.orders ?? EMPTY_ORDERS);
  const lastExecution = useTradingStore((state) => state.lastExecution);
  const lastOrderUpdate = useTradingStore((state) => state.lastOrderUpdate);
  const [manualMessage, setManualMessage] = useState("");
  const openOrders = useMemo(() => orders.filter((order) => order.status === "OPEN"), [orders]);
  const recentHistoryOrders = useMemo(() => orders.filter((order) => order.status !== "OPEN").slice(0, 50), [orders]);
  const shouldShowHistoryFallback = openOrders.length === 0;
  const displayedOrders = shouldShowHistoryFallback ? recentHistoryOrders : openOrders;
  const fallbackMessage = shouldShowHistoryFallback
    ? recentHistoryOrders.length > 0
      ? "No open orders - showing recent history"
      : "No open orders yet"
    : "";
  const lifecycleMessage =
    manualMessage ||
    (lastExecution
      ? `Filled ${lastExecution.side} ${lastExecution.symbol} ${formatNumber(lastExecution.quantity, 5)} @ $${formatNumber(
          lastExecution.price,
          2
        )}`
      : lastOrderUpdate
        ? `${lastOrderUpdate.status} ${lastOrderUpdate.side} ${lastOrderUpdate.symbol}`
        : fallbackMessage);

  useEffect(() => {
    if (!manualMessage) return;
    const timer = window.setTimeout(() => setManualMessage(""), 2500);
    return () => window.clearTimeout(timer);
  }, [manualMessage]);

  const columns = useMemo<ColDef<Order>[]>(
    () => [
      { field: "symbol", width: 98 },
      { field: "side", width: 76, cellClass: (params) => (params.value === "BUY" ? "grid-up" : "grid-down") },
      {
        field: "status",
        width: 104,
        cellRenderer: (params: ICellRendererParams<Order, Order["status"]>) => (
          <span className={`status-badge status-${String(params.value).toLowerCase()}`}>{params.value}</span>
        )
      },
      { field: "quantity", headerName: "Qty", width: 84, valueFormatter: (params) => formatNumber(Number(params.value), 5) },
      {
        field: "filledQuantity",
        headerName: "Filled",
        width: 84,
        valueFormatter: (params) => formatNumber(Number(params.value), 5)
      },
      {
        headerName: "Limit/Fill",
        flex: 1,
        minWidth: 104,
        valueGetter: (params) => params.data?.avgFillPrice ?? params.data?.price,
        valueFormatter: (params) => (params.value ? `$${formatNumber(Number(params.value), 2)}` : "-")
      },
      {
        field: "updatedAt",
        headerName: "Updated",
        width: 104,
        valueFormatter: (params) =>
          new Date(String(params.value)).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          })
      },
      {
        headerName: "",
        width: 76,
        cellRenderer: (params: ICellRendererParams<Order>) => {
          const order = params.data;
          if (!order || order.status !== "OPEN") return <span>-</span>;
          return (
            <button
              type="button"
              className="grid-action"
              onClick={async () => {
                await cancelOrder(order.id);
                setManualMessage(`Canceled ${order.side} ${order.symbol}`);
              }}
            >
              Cancel
            </button>
          );
        }
      }
    ],
    []
  );

  return (
    <PanelShell
      title="Open Orders"
      meta={<span>{shouldShowHistoryFallback ? `${recentHistoryOrders.length} history` : `${openOrders.length} working`}</span>}
    >
      <DataGrid rows={displayedOrders} columns={columns} getRowId={(row) => row.id} />
      <div className="grid-status">{lifecycleMessage}</div>
    </PanelShell>
  );
}
