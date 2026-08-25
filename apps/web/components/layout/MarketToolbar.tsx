"use client";

import { Activity, PanelTop, RotateCcw, Wifi, WifiOff } from "lucide-react";
import type { MarketSymbol } from "@reya/shared";
import { formatNumber } from "@reya/shared";
import { useTradingStore } from "../../lib/tradingStore";

export function MarketToolbar({ onResetLayout }: { onResetLayout: () => void }) {
  const connection = useTradingStore((state) => state.connection);
  const selectedSymbol = useTradingStore((state) => state.selectedSymbol);
  const setSelectedSymbol = useTradingStore((state) => state.setSelectedSymbol);
  const markets = useTradingStore((state) => state.markets);
  const ticker = useTradingStore((state) => state.tickers[selectedSymbol]);
  const account = useTradingStore((state) => state.account);

  return (
    <header className="terminal-toolbar">
      <div className="brand-lockup">
        <PanelTop size={18} />
        <strong>Reya Trading</strong>
      </div>

      <label className="market-select">
        <span>Market</span>
        <select
          value={selectedSymbol}
          onChange={(event) => setSelectedSymbol(event.target.value as MarketSymbol)}
          data-testid="market-select"
        >
          {(markets.length ? markets : [{ symbol: "BTC-USD" }, { symbol: "ETH-USD" }, { symbol: "SOL-USD" }]).map(
            (market) => (
              <option key={market.symbol} value={market.symbol}>
                {market.symbol}
              </option>
            )
          )}
        </select>
      </label>

      <div className="ticker-strip">
        <Metric label="Mark" value={ticker ? `$${formatNumber(ticker.markPrice, 2)}` : "-"} />
        <Metric label="24h" value={ticker ? `${ticker.change24h.toFixed(2)}%` : "-"} tone={(ticker?.change24h ?? 0) >= 0 ? "up" : "down"} />
        <Metric label="Funding" value={ticker ? `${(ticker.fundingRate * 100).toFixed(4)}%` : "-"} />
        <Metric label="Equity" value={account ? `$${formatNumber(account.account.equity, 2)}` : "-"} />
      </div>

      <div className={`connection-pill ${connection}`}>
        {connection === "connected" ? <Wifi size={15} /> : <WifiOff size={15} />}
        <span>{connection}</span>
      </div>

      <button type="button" className="icon-button" onClick={onResetLayout} aria-label="Reset layout">
        <RotateCcw size={16} />
      </button>
    </header>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="toolbar-metric">
      <Activity size={13} />
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}
