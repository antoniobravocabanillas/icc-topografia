"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { terraqoDomains } from "@/lib/terraqo-domains";

type SignOutButtonProps = {
  className?: string;
};

export function SignOutButton({ className }: SignOutButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        await signOut({ redirect: false });
        window.location.assign(`${terraqoDomains.portal}/cuenta`);
      }}
    >
      <LogOut className="h-4 w-4" />
      Cerrar sesion
    </Button>
  );
}
