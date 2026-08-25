"use client";

import { GoldenLayout, LayoutConfig, type ComponentContainer, type LayoutConfig as GoldenLayoutConfig } from "golden-layout";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useRef } from "react";
import { AccountPanel } from "../panels/AccountPanel";
import { MarketsGridPanel } from "../panels/MarketsGridPanel";
import { OpenOrdersPanel } from "../panels/OpenOrdersPanel";
import { OrderBookPanel } from "../panels/OrderBookPanel";
import { OrderHistoryPanel } from "../panels/OrderHistoryPanel";
import { OrderTicketPanel } from "../panels/OrderTicketPanel";
import { PositionsPanel } from "../panels/PositionsPanel";
import { PriceChartPanel } from "../panels/PriceChartPanel";
import { TradeTapePanel } from "../panels/TradeTapePanel";

const COMPONENTS = {
  markets: MarketsGridPanel,
  account: AccountPanel,
  chart: PriceChartPanel,
  orderbook: OrderBookPanel,
  trades: TradeTapePanel,
  ticket: OrderTicketPanel,
  orders: OpenOrdersPanel,
  history: OrderHistoryPanel,
  positions: PositionsPanel
};

type WorkspaceComponentType = keyof typeof COMPONENTS;
type WorkspaceLayoutItem = {
  type?: string;
  content?: WorkspaceLayoutItem[];
  isClosable?: boolean;
  reorderEnabled?: boolean;
  [key: string]: unknown;
};
type WorkspaceLayoutConfig = GoldenLayoutConfig & {
  root?: WorkspaceLayoutItem;
};

const LAYOUT_STORAGE_KEY = "reya-trading:golden-layout";

function panel(componentType: WorkspaceComponentType, title: string, size: Record<string, number> = {}) {
  return {
    type: "component",
    componentType,
    title,
    isClosable: true,
    reorderEnabled: true,
    ...size
  };
}

const DEFAULT_LAYOUT = {
  root: {
    type: "row",
    content: [
      {
        type: "column",
        width: 24,
        content: [
          panel("markets", "Markets", { height: 38 }),
          panel("account", "Account", { height: 62 })
        ]
      },
      {
        type: "column",
        width: 43,
        content: [
          panel("chart", "Price Chart", { height: 58 }),
          {
            type: "stack",
            height: 42,
            isClosable: true,
            reorderEnabled: true,
            content: [
              panel("orders", "Open Orders"),
              panel("history", "Order History"),
              panel("positions", "Positions")
            ]
          }
        ]
      },
      {
        type: "column",
        width: 33,
        content: [
          panel("orderbook", "Order Book", { height: 42 }),
          panel("trades", "Trade Tape", { height: 16 }),
          panel("ticket", "Order Ticket", { height: 42 })
        ]
      }
    ]
  },
  settings: {
    constrainDragToContainer: true,
    reorderEnabled: true,
    reorderOnTabMenuClick: true,
    showPopoutIcon: false,
    showMaximiseIcon: true,
    showCloseIcon: false
  },
  dimensions: {
    borderWidth: 6,
    borderGrabWidth: 14,
    defaultMinItemHeight: "120px",
    defaultMinItemWidth: "220px",
    dragProxyWidth: 340,
    dragProxyHeight: 220,
    headerHeight: 28
  },
  header: {
    show: "top",
    popout: false,
    close: "Close panel",
    maximise: "Maximize panel",
    minimise: "Restore panel",
    tabDropdown: "More tabs"
  }
};

export function GoldenWorkspace({ resetVersion }: { resetVersion: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const host = hostRef.current;
    const roots: Root[] = [];
    const layout = new GoldenLayout(host);
    layout.resizeWithContainerAutomatically = true;

    for (const [componentType, Component] of Object.entries(COMPONENTS)) {
      layout.registerComponentFactoryFunction(componentType, (container: ComponentContainer) => {
        const mount = document.createElement("div");
        mount.className = "gl-react-mount";
        container.element.appendChild(mount);
        const root = createRoot(mount);
        roots.push(root);
        root.render(<Component />);
      });
    }

    const savedLayout = resetVersion === 0 ? readSavedLayout() : undefined;
    if (resetVersion > 0) {
      window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
    }

    try {
      loadWorkspaceLayout(layout, savedLayout ?? DEFAULT_LAYOUT);
    } catch {
      window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
      loadWorkspaceLayout(layout, DEFAULT_LAYOUT);
    }

    let resizeFrame: number | undefined;
    let saveFrame: number | undefined;
    let isDestroying = false;
    const resizeTimers: number[] = [];
    const resizeNow = () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = undefined;
        const rect = host.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          layout.setSize(Math.floor(rect.width), Math.floor(rect.height));
        }
      });
    };
    const resizeImmediately = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        layout.setSize(Math.floor(rect.width), Math.floor(rect.height));
      }
      resizeNow();
    };
    const resizeAfterViewportChange = () => {
      while (resizeTimers.length > 0) {
        const timer = resizeTimers.pop();
        if (timer) window.clearTimeout(timer);
      }
      resizeNow();
      for (const delay of [50, 150, 350, 700]) {
        resizeTimers.push(window.setTimeout(resizeNow, delay));
      }
    };
    const observer = new ResizeObserver(resizeAfterViewportChange);
    const saveLayout = () => {
      if (isDestroying) return;
      if (saveFrame) window.clearTimeout(saveFrame);
      saveFrame = window.setTimeout(() => {
        saveFrame = undefined;
        if (isDestroying) return;
        try {
          window.localStorage.setItem(
            LAYOUT_STORAGE_KEY,
            JSON.stringify(normalizeLayoutForWorkspace(LayoutConfig.fromResolved(layout.saveLayout())))
          );
        } catch {
          window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
        }
      }, 250);
    };

    layout.on("stateChanged", saveLayout);
    observer.observe(host);
    window.addEventListener("resize", resizeAfterViewportChange);
    window.visualViewport?.addEventListener("resize", resizeAfterViewportChange);
    window.addEventListener("orientationchange", resizeAfterViewportChange);
    window.addEventListener("focus", resizeAfterViewportChange);
    document.addEventListener("fullscreenchange", resizeAfterViewportChange);
    resizeImmediately();
    const settleTimer = window.setTimeout(resizeNow, 100);

    return () => {
      isDestroying = true;
      window.clearTimeout(settleTimer);
      if (saveFrame) window.clearTimeout(saveFrame);
      for (const timer of resizeTimers) window.clearTimeout(timer);
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      window.removeEventListener("resize", resizeAfterViewportChange);
      window.visualViewport?.removeEventListener("resize", resizeAfterViewportChange);
      window.removeEventListener("orientationchange", resizeAfterViewportChange);
      window.removeEventListener("focus", resizeAfterViewportChange);
      document.removeEventListener("fullscreenchange", resizeAfterViewportChange);
      layout.destroy();
      window.setTimeout(() => {
        for (const root of roots) root.unmount();
      }, 0);
    };
  }, [resetVersion]);

  return <div ref={hostRef} className="golden-workspace" data-testid="golden-workspace" />;
}

function readSavedLayout() {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return LayoutConfig.isResolved(parsed) ? LayoutConfig.fromResolved(parsed) : parsed;
  } catch {
    window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
    return undefined;
  }
}

function loadWorkspaceLayout(layout: GoldenLayout, layoutConfig: unknown) {
  layout.loadLayout(normalizeLayoutForWorkspace(layoutConfig));
}

function normalizeLayoutForWorkspace(layoutConfig: unknown): GoldenLayoutConfig {
  const config = JSON.parse(JSON.stringify(layoutConfig)) as WorkspaceLayoutConfig;
  config.settings = {
    ...(config.settings ?? {}),
    constrainDragToContainer: true,
    reorderEnabled: true,
    reorderOnTabMenuClick: true,
    showPopoutIcon: false,
    showMaximiseIcon: true,
    showCloseIcon: false
  };
  config.header = {
    ...(config.header ?? {}),
    show: "top",
    popout: false,
    close: "Close panel",
    maximise: "Maximize panel",
    minimise: "Restore panel",
    tabDropdown: "More tabs"
  };
  normalizeLayoutItem(config.root);
  return config;
}

function normalizeLayoutItem(item: WorkspaceLayoutItem | undefined) {
  if (!item) return;
  if (item.type === "stack" || item.type === "component") {
    item.isClosable = true;
    item.reorderEnabled = true;
  }
  for (const child of item.content ?? []) {
    normalizeLayoutItem(child);
  }
}
