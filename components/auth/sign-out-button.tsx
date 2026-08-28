"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

type SignOutButtonProps = {
  className?: string;
  iconOnly?: boolean;
};

export function SignOutButton({ className, iconOnly = false }: SignOutButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      aria-label={iconOnly ? "Cerrar sesión" : undefined}
      title={iconOnly ? "Cerrar sesión" : undefined}
      onClick={async () => {
        await fetch("/api/auth/presence", { method: "DELETE", keepalive: true }).catch(() => null);
        await signOut({ redirect: false });
        window.location.assign("/cuenta");
      }}
    >
      <LogOut className="h-4 w-4" />
      <span className={iconOnly ? "sr-only" : undefined}>Cerrar sesión</span>
    </Button>
  );
}
