"use client";

import { useMemo } from "react";
import type { ColDef } from "ag-grid-community";
import type { Market } from "@reya/shared";
import { formatNumber } from "@reya/shared";
import { useTradingStore } from "../../lib/tradingStore";
import { DataGrid } from "../ui/DataGrid";
import { PanelShell } from "../ui/PanelShell";

interface MarketRow extends Market {
  markPrice: number | undefined;
  change24h: number | undefined;
}

export function MarketsGridPanel() {
  const markets = useTradingStore((state) => state.markets);
  const tickers = useTradingStore((state) => state.tickers);
  const setSelectedSymbol = useTradingStore((state) => state.setSelectedSymbol);
  const rows = useMemo<MarketRow[]>(
    () =>
      markets.map((market) => ({
        ...market,
        markPrice: tickers[market.symbol]?.markPrice,
        change24h: tickers[market.symbol]?.change24h
      })),
    [markets, tickers]
  );

  const columns = useMemo<ColDef<MarketRow>[]>(
    () => [
      { field: "symbol", flex: 1.2 },
      { field: "markPrice", headerName: "Mark", flex: 1, valueFormatter: (params) => (params.value ? `$${formatNumber(Number(params.value), 2)}` : "-") },
      {
        field: "change24h",
        headerName: "24h",
        width: 82,
        cellClass: (params) => (Number(params.value) >= 0 ? "grid-up" : "grid-down"),
        valueFormatter: (params) => (params.value === undefined ? "-" : `${Number(params.value).toFixed(2)}%`)
      }
    ],
    []
  );

  return (
    <PanelShell title="Markets">
      <DataGrid rows={rows} columns={columns} getRowId={(row) => row.symbol} onRowClicked={(row) => setSelectedSymbol(row.symbol)} />
    </PanelShell>
  );
}
