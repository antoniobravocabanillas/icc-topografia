"use client";

import { useState } from "react";

export function TerraqoAvatar({
  src,
  name,
  className,
  textClassName = "text-[#008c83]"
}: {
  src?: string | null;
  name: string;
  className: string;
  textClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TQ";

  return (
    <span className={`relative grid place-items-center overflow-hidden bg-[#e7f8f5] font-display font-black ${textClassName} ${className}`}>
      <span aria-hidden="true">{initials}</span>
      {src && !failed ? <img src={src} alt={name} onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" /> : null} {/* eslint-disable-line @next/next/no-img-element -- avatar URLs are workspace-managed and need a resilient fallback. */}
    </span>
  );
}
