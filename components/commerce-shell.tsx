"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

type CommerceShellProps = {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  chat?: ReactNode;
};

export function CommerceShell({ children, header, footer, chat }: CommerceShellProps) {
  const pathname = usePathname();
  const isPortal = pathname.startsWith("/portal");

  if (isPortal) return <>{children}</>;

  return (
    <>
      {header}
      <main>{children}</main>
      {footer}
      {chat}
    </>
  );
}
