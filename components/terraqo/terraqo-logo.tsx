"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type TerraqoLogoProps = {
  src?: string | null;
  alt?: string;
  variant?: "mark" | "horizontal" | "vertical";
  tone?: "light" | "dark";
  className?: string;
  imageClassName?: string;
};

const officialAssets = {
  light: {
    mark: "/brand/terraqo-3/withbackground/icon_bg_white.svg",
    horizontal: "/brand/terraqo-3/withbackground/LH compact bg white.svg",
    vertical: "/brand/terraqo-3/withbackground/LV wordbran bg white.svg"
  },
  dark: {
    mark: "/brand/terraqo-3/withbackground/icon bg dark.svg",
    horizontal: "/brand/terraqo-3/logo-horizontal-dark-transparent.svg",
    vertical: "/brand/terraqo-3/withbackground/LV wordbran bg dark.svg"
  }
} as const;

/**
 * Single logo entry point for Terraqo and white-label workspaces.
 * Workspace branding wins; the official Terraqo mark is the safe fallback.
 * `object-contain` is intentional because uploaded logos do not share an aspect ratio.
 */
export function TerraqoLogo({ src, alt = "Terraqo", variant = "mark", tone = "light", className, imageClassName }: TerraqoLogoProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [customAssetFailed, setCustomAssetFailed] = useState(false);
  const customAsset = src?.trim();
  const fallbackAsset = officialAssets[tone][variant];
  const resolvedSrc = customAsset && !customAssetFailed ? customAsset : fallbackAsset;

  useEffect(() => {
    setCustomAssetFailed(false);
    const image = imageRef.current;
    if (customAsset && image?.complete && image.naturalWidth === 0) setCustomAssetFailed(true);
  }, [customAsset]);

  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={resolvedSrc}
        alt={alt}
        className={cn("h-full w-full object-contain", imageClassName)}
        loading="eager"
        onLoad={(event) => {
          if (resolvedSrc !== fallbackAsset && event.currentTarget.naturalWidth === 0) setCustomAssetFailed(true);
        }}
        onError={() => {
          if (resolvedSrc !== fallbackAsset) setCustomAssetFailed(true);
        }}
      />
    </span>
  );
}

export { officialAssets as terraqoOfficialAssets };
