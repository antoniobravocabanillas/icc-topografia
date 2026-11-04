"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareText } from "lucide-react";

export function AttentionShortcut() {
  const pathname = usePathname();
  if (pathname === "/admin/chat" || pathname.startsWith("/admin/chat/")) return null;
  return <Link href="/admin/chat" aria-label="Abrir bandeja de atención" title="Abrir bandeja de atención" className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-14 w-14 items-center justify-center gap-2 sm:w-auto rounded-full bg-primary sm:px-5 font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:right-6"><MessageSquareText className="h-5 w-5" /><span className="hidden sm:inline">Atención</span></Link>;
}
