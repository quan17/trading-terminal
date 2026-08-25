"use client";

import { useMemo } from "react";
import type { ColDef } from "ag-grid-community";
import type { Trade } from "@reya/shared";
import { formatNumber } from "@reya/shared";
import { useTradingStore } from "../../lib/tradingStore";
import { EMPTY_TRADES } from "../../lib/empty";
import { DataGrid } from "../ui/DataGrid";
import { PanelShell } from "../ui/PanelShell";

export function TradeTapePanel() {
  const selectedSymbol = useTradingStore((state) => state.selectedSymbol);
  const trades = useTradingStore((state) => state.trades[selectedSymbol] ?? EMPTY_TRADES);
  const columns = useMemo<ColDef<Trade>[]>(
    () => [
      { field: "side", width: 82, cellClass: (params) => (params.value === "BUY" ? "grid-up" : "grid-down") },
      { field: "price", flex: 1, valueFormatter: (params) => `$${formatNumber(Number(params.value), 2)}` },
      { field: "quantity", flex: 1, valueFormatter: (params) => formatNumber(Number(params.value), 5) },
      {
        field: "createdAt",
        headerName: "Time",
        width: 104,
        valueFormatter: (params) => new Date(String(params.value)).toLocaleTimeString()
      }
    ],
    []
  );

  return (
    <PanelShell title="Trade Tape" meta={<span>{trades.length} prints</span>}>
      <DataGrid rows={trades} columns={columns} getRowId={(row) => row.id} />
    </PanelShell>
  );
}
