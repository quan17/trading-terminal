"use client";

import { useMemo } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { Order } from "@reya/shared";
import { formatNumber } from "@reya/shared";
import { EMPTY_ORDERS } from "../../lib/empty";
import { useTradingStore } from "../../lib/tradingStore";
import { DataGrid } from "../ui/DataGrid";
import { PanelShell } from "../ui/PanelShell";

export function OrderHistoryPanel() {
  const orders = useTradingStore((state) => state.account?.orders ?? EMPTY_ORDERS);
  const historyOrders = useMemo(() => orders.filter((order) => order.status !== "OPEN").slice(0, 50), [orders]);
  const columns = useMemo<ColDef<Order>[]>(
    () => [
      { field: "symbol", width: 92 },
      { field: "side", width: 64, cellClass: (params) => (params.value === "BUY" ? "grid-up" : "grid-down") },
      {
        field: "status",
        width: 112,
        cellRenderer: (params: ICellRendererParams<Order, Order["status"]>) => (
          <span className={`status-badge status-${String(params.value).toLowerCase()}`}>{params.value}</span>
        )
      },
      { field: "quantity", headerName: "Qty", width: 78, valueFormatter: (params) => formatNumber(Number(params.value), 5) },
      {
        field: "filledQuantity",
        headerName: "Filled",
        width: 78,
        valueFormatter: (params) => formatNumber(Number(params.value), 5)
      },
      {
        headerName: "Limit/Fill",
        flex: 1,
        minWidth: 96,
        valueGetter: (params) => params.data?.avgFillPrice ?? params.data?.price,
        valueFormatter: (params) => (params.value ? `$${formatNumber(Number(params.value), 2)}` : "-")
      },
      {
        field: "updatedAt",
        headerName: "Updated",
        width: 96,
        valueFormatter: (params) =>
          new Date(String(params.value)).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          })
      }
    ],
    []
  );

  return (
    <PanelShell title="Order History" meta={<span>{historyOrders.length} records</span>}>
      <DataGrid rows={historyOrders} columns={columns} getRowId={(row) => row.id} />
    </PanelShell>
  );
}
