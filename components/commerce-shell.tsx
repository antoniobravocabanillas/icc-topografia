"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

type CommerceShellProps = {
  children: ReactNode;
  header: ReactNode;
  darkHeader?: ReactNode;
  footer: ReactNode;
  chat?: ReactNode;
  forceBare?: boolean;
};

export function CommerceShell({ children, header, darkHeader, footer, chat, forceBare = false }: CommerceShellProps) {
  const pathname = usePathname();
  const isPortal = forceBare || pathname.startsWith("/portal");
  const isAccount = pathname === "/cuenta";

  if (isPortal) return <>{children}</>;

  return (
    <>
      {isAccount && darkHeader ? darkHeader : header}
      <main>{children}</main>
      {!isAccount ? footer : null}
      {!isAccount ? chat : null}
    </>
  );
}
