import type { ReactNode } from "react";

export function PortalPageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-5 border-b pb-8 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h1 className="mt-3 max-w-4xl font-display text-4xl font-bold leading-tight md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
