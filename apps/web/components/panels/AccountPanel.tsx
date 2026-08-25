"use client";

import { formatNumber } from "@reya/shared";
import { useTradingStore } from "../../lib/tradingStore";
import { PanelShell } from "../ui/PanelShell";

export function AccountPanel() {
  const account = useTradingStore((state) => state.account);
  const selectedSymbol = useTradingStore((state) => state.selectedSymbol);
  const markets = useTradingStore((state) => state.markets);
  const ticker = useTradingStore((state) => state.tickers[selectedSymbol]);
  const market = markets.find((item) => item.symbol === selectedSymbol);
  const baseAsset = market?.baseAsset ?? selectedSymbol.split("-")[0] ?? "BASE";
  const usdBalance = findBalance(account, "USD");
  const baseBalance = findBalance(account, baseAsset);
  const totalPnl = account?.portfolio.totalPnl ?? 0;

  return (
    <PanelShell title="Portfolio" meta={<span>{selectedSymbol}</span>}>
      <div className="account-grid">
        <AccountMetric label="Equity" value={account ? `$${formatNumber(account.account.equity, 2)}` : "-"} accent />
        <AccountMetric
          label="Total PnL"
          value={account ? `${formatSignedMoney(totalPnl)} (${formatSignedPercent(account.portfolio.totalPnlPercent)})` : "-"}
          tone={totalPnl >= 0 ? "up" : "down"}
        />
        <AccountMetric label="Available USD" value={`$${formatNumber(usdBalance.available, 2)}`} />
        <AccountMetric label="Mark Price" value={ticker ? `$${formatNumber(ticker.markPrice, 2)}` : "-"} />
      </div>
      <div className="balance-table" data-testid="account-balances">
        <div className="balance-row balance-head">
          <span>Asset</span>
          <span>Total</span>
          <span>Reserved</span>
          <span>Available</span>
        </div>
        <BalanceRow asset="USD" balance={usdBalance} money />
        <BalanceRow asset={baseAsset} balance={baseBalance} />
      </div>
      <div className="mini-ledger">
        {(account?.trades ?? []).slice(0, 5).map((trade) => (
          <div key={trade.id} className="mini-ledger-row">
            <span className={trade.side === "BUY" ? "up" : "down"}>{trade.side}</span>
            <span>{trade.symbol}</span>
            <strong>{formatNumber(trade.quantity, 5)}</strong>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function AccountMetric({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: "up" | "down" }) {
  return (
    <div className={accent ? "account-metric accent" : "account-metric"}>
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function BalanceRow({
  asset,
  balance,
  money
}: {
  asset: string;
  balance: { total: number; reserved: number; available: number };
  money?: boolean;
}) {
  const format = (value: number) => (money ? `$${formatNumber(value, 2)}` : formatNumber(value, 5));
  return (
    <div className="balance-row">
      <strong>{asset}</strong>
      <span>{format(balance.total)}</span>
      <span>{format(balance.reserved)}</span>
      <span>{format(balance.available)}</span>
    </div>
  );
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

function formatSignedMoney(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}$${formatNumber(value, 2)}`;
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 2)}%`;
}
