import type { ReactNode } from "react";

export function PortalPageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 border-b pb-5 sm:gap-5 sm:pb-8 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h1 className="mt-2 max-w-4xl font-display text-[2rem] font-bold leading-[1.08] sm:mt-3 sm:text-4xl md:text-5xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground sm:mt-4 sm:text-base sm:leading-7">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
