"use client";

import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type UserAvatarProps = {
  name?: string | null;
  image?: string | null;
  size?: "sm" | "md" | "lg" | "xl" | "profile";
  className?: string;
};

const sizeClasses = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-base",
  xl: "h-28 w-28 text-2xl",
  profile: "h-20 w-20 text-lg sm:h-28 sm:w-28 sm:text-2xl"
};

function initials(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return `${parts[0]?.[0] || ""}${parts.length > 1 ? parts.at(-1)?.[0] || "" : ""}`.toUpperCase();
}

export function UserAvatar({ name, image, size = "md", className = "" }: UserAvatarProps) {
  const label = name ? `Foto de perfil de ${name}` : "Foto de perfil";
  const fallback = initials(name);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [image]);

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-primary/20 bg-primary/10 font-display font-bold text-primary ${sizeClasses[size]} ${className}`}
      aria-label={label}
    >
      {image && !imageFailed ? (
        // Avatar URLs can come from Terraqo storage or an approved external identity provider.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={label} className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
      ) : fallback ? (
        <span aria-hidden="true">{fallback}</span>
      ) : (
        <UserRound className="h-1/2 w-1/2" aria-hidden="true" />
      )}
    </span>
  );
}
