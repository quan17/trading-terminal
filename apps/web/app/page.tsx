"use client";

import dynamic from "next/dynamic";

const TradingTerminal = dynamic(
  () => import("../components/TradingTerminal").then((mod) => mod.TradingTerminal),
  {
    ssr: false,
    loading: () => <main className="boot-screen">Opening trading terminal...</main>
  }
);

export default function Home() {
  return <TradingTerminal />;
}
