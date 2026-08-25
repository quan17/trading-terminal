"use client";

import { clsx } from "clsx";

export function PanelShell({
  title,
  meta,
  children,
  className
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("panel-shell", className)}>
      <header className="panel-header">
        <span>{title}</span>
        {meta ? <div className="panel-meta">{meta}</div> : null}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
