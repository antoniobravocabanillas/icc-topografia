"use client";

import { useState } from "react";

export function ExpandableSummary({ text, className = "" }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = text.trim().length > 180;
  return (
    <div className={className}>
      <p className={`text-sm leading-6 text-white/70 ${expanded ? "" : "line-clamp-3"}`}>{text}</p>
      {canExpand ? <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 min-h-9 rounded-lg px-1 text-sm font-bold text-[#25c0d5] underline-offset-4 hover:underline" aria-expanded={expanded}>
        {expanded ? "Mostrar menos" : "Leer más"}
      </button> : null}
    </div>
  );
}
