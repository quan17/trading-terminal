"use client";

import { useMemo } from "react";
import type { ColDef } from "ag-grid-community";
import type { Position } from "@reya/shared";
import { formatNumber } from "@reya/shared";
import { EMPTY_POSITIONS } from "../../lib/empty";
import { useTradingStore } from "../../lib/tradingStore";
import { DataGrid } from "../ui/DataGrid";
import { PanelShell } from "../ui/PanelShell";

export function PositionsPanel() {
  const positions = useTradingStore((state) => state.account?.positions ?? EMPTY_POSITIONS);
  const rows = useMemo(() => positions.filter((position) => Math.abs(position.quantity) > 0.00000001), [positions]);
  const columns = useMemo<ColDef<Position>[]>(
    () => [
      { field: "symbol", width: 116 },
      { field: "quantity", flex: 1, valueFormatter: (params) => formatNumber(Number(params.value), 5) },
      { field: "avgEntryPrice", headerName: "Entry", flex: 1, valueFormatter: (params) => `$${formatNumber(Number(params.value), 2)}` },
      { field: "markPrice", headerName: "Mark", flex: 1, valueFormatter: (params) => `$${formatNumber(Number(params.value), 2)}` },
      { field: "notional", flex: 1, valueFormatter: (params) => `$${formatNumber(Number(params.value), 2)}` },
      {
        field: "unrealizedPnl",
        headerName: "uPnL",
        flex: 1,
        cellClass: (params) => (Number(params.value) >= 0 ? "grid-up" : "grid-down"),
        valueFormatter: (params) => `$${formatNumber(Number(params.value), 2)}`
      }
    ],
    []
  );

  return (
    <PanelShell title="Positions" meta={<span>{rows.length} active</span>}>
      <DataGrid rows={rows} columns={columns} getRowId={(row) => row.id} />
    </PanelShell>
  );
}
