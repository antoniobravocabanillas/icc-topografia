"use client";

import { useState } from "react";

export function TerraqoAvatar({
  src,
  name,
  className,
  textClassName = "text-[#4374ba]"
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
    <span role="img" aria-label={name} className={`relative grid place-items-center overflow-hidden bg-[#edf1f7] font-display font-black ${textClassName} ${className}`}>
      <span aria-hidden="true">{initials}</span>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar URLs are workspace-managed and need a resilient fallback.
        <img src={src} alt="" aria-hidden="true" onLoad={(event) => {
          if (event.currentTarget.naturalWidth === 0) setFailed(true);
        }} onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
    </span>
  );
}
