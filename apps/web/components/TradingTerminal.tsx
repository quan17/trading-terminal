"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { WsServerEvent } from "@reya/shared";
import { getAccountSnapshot, getMarkets, getMarketSnapshot } from "../lib/api";
import { WS_URL } from "../lib/config";
import { useTradingStore } from "../lib/tradingStore";
import { QueryProvider } from "./providers/QueryProvider";
import { GoldenWorkspace } from "./layout/GoldenWorkspace";
import { MarketToolbar } from "./layout/MarketToolbar";

export function TradingTerminal() {
  return (
    <QueryProvider>
      <TradingTerminalInner />
    </QueryProvider>
  );
}

function TradingTerminalInner() {
  const [layoutVersion, setLayoutVersion] = useState(0);
  const selectedSymbol = useTradingStore((state) => state.selectedSymbol);
  const setMarkets = useTradingStore((state) => state.setMarkets);
  const hydrateMarketSnapshot = useTradingStore((state) => state.hydrateMarketSnapshot);
  const setAccount = useTradingStore((state) => state.setAccount);

  const marketsQuery = useQuery({ queryKey: ["markets"], queryFn: getMarkets });
  const accountQuery = useQuery({ queryKey: ["account"], queryFn: getAccountSnapshot });
  const snapshotQuery = useQuery({
    queryKey: ["market-snapshot", selectedSymbol],
    queryFn: () => getMarketSnapshot(selectedSymbol)
  });

  useTradingSocket();

  useEffect(() => {
    if (marketsQuery.data) setMarkets(marketsQuery.data);
  }, [marketsQuery.data, setMarkets]);

  useEffect(() => {
    if (accountQuery.data) setAccount(accountQuery.data);
  }, [accountQuery.data, setAccount]);

  useEffect(() => {
    if (snapshotQuery.data) hydrateMarketSnapshot(snapshotQuery.data);
  }, [hydrateMarketSnapshot, snapshotQuery.data]);

  return (
    <main className="terminal-root">
      <MarketToolbar onResetLayout={() => setLayoutVersion((value) => value + 1)} />
      <GoldenWorkspace resetVersion={layoutVersion} />
    </main>
  );
}

function useTradingSocket() {
  const applyWsEvent = useTradingStore((state) => state.applyWsEvent);
  const setConnection = useTradingStore((state) => state.setConnection);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;
    let stopped = false;

    const connect = () => {
      setConnection(socket ? "reconnecting" : "connecting");
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        setConnection("connected");
        pingTimer = window.setInterval(() => {
          socket?.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        }, 15_000);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as WsServerEvent;
          applyWsEvent(payload);
        } catch {
          applyWsEvent({ type: "error", message: "Malformed WebSocket payload." });
        }
      };

      socket.onclose = () => {
        if (pingTimer) window.clearInterval(pingTimer);
        if (stopped) {
          setConnection("disconnected");
          return;
        }
        setConnection("reconnecting");
        reconnectTimer = window.setTimeout(connect, 1200);
      };

      socket.onerror = () => {
        setConnection("reconnecting");
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      socket?.close();
    };
  }, [applyWsEvent, setConnection]);
}
