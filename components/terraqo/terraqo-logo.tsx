import { cn } from "@/lib/utils";

type TerraqoLogoProps = {
  src?: string | null;
  alt?: string;
  variant?: "mark" | "horizontal" | "vertical";
  className?: string;
  imageClassName?: string;
};

const officialAssets = {
  mark: "/brand/terraqo-3/isotipo-icono.svg",
  horizontal: "/brand/terraqo-3/logo-horizontal.svg",
  vertical: "/brand/terraqo-3/logo-vertical.svg"
} as const;

/**
 * Single logo entry point for Terraqo and white-label workspaces.
 * Workspace branding wins; the official Terraqo mark is the safe fallback.
 * `object-contain` is intentional because uploaded logos do not share an aspect ratio.
 */
export function TerraqoLogo({ src, alt = "Terraqo", variant = "mark", className, imageClassName }: TerraqoLogoProps) {
  const resolvedSrc = src?.trim() || officialAssets[variant];
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedSrc}
        alt={alt}
        className={cn("h-full w-full object-contain", imageClassName)}
        loading="eager"
      />
    </span>
  );
}

export { officialAssets as terraqoOfficialAssets };
