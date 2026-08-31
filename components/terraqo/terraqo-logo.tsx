"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { terraqoDomains } from "@/lib/terraqo-domains";

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
    mark: `${terraqoDomains.public}/brand/terraqo-3/isotipo-icono.svg`,
    horizontal: `${terraqoDomains.public}/brand/terraqo-3/withbackground/LH%20compact%20bg%20white.svg`,
    vertical: `${terraqoDomains.public}/brand/terraqo-3/withbackground/LV%20wordbran%20bg%20white.svg`,
  },
  dark: {
    mark: `${terraqoDomains.public}/brand/terraqo-3/withbackground/icon%20bg%20dark.svg`,
    horizontal: `${terraqoDomains.public}/brand/terraqo-3/logo-horizontal-dark-transparent.svg`,
    vertical: `${terraqoDomains.public}/brand/terraqo-3/withbackground/LV%20wordbran%20bg%20dark.svg`,
  },
} as const;

/**
 * Single logo entry point for Terraqo and white-label workspaces.
 * Workspace branding wins; the official Terraqo mark is the safe fallback.
 * `object-contain` is intentional because uploaded logos do not share an aspect ratio.
 */
export function TerraqoLogo({
  src,
  alt = "Terraqo",
  variant = "mark",
  tone = "light",
  className,
  imageClassName,
}: TerraqoLogoProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [customAssetFailed, setCustomAssetFailed] = useState(false);
  const customAsset = src?.trim();
  const fallbackAsset = officialAssets[tone][variant];
  const resolvedSrc =
    customAsset && !customAssetFailed ? customAsset : fallbackAsset;

  useEffect(() => {
    setCustomAssetFailed(false);
    const image = imageRef.current;
    if (customAsset && image?.complete && image.naturalWidth === 0)
      setCustomAssetFailed(true);
  }, [customAsset]);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={resolvedSrc}
        alt={alt}
        className={cn("h-full w-full object-contain", imageClassName)}
        loading="eager"
        onLoad={(event) => {
          if (
            resolvedSrc !== fallbackAsset &&
            event.currentTarget.naturalWidth === 0
          )
            setCustomAssetFailed(true);
        }}
        onError={() => {
          if (resolvedSrc !== fallbackAsset) setCustomAssetFailed(true);
        }}
      />
    </span>
  );
}

export { officialAssets as terraqoOfficialAssets };
