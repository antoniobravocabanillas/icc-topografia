"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AttentionRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine && !document.querySelector("form:focus-within")) start(() => router.refresh());
    }, 30000);
    return () => window.clearInterval(interval);
  }, [router]);
  return <Button variant="outline" disabled={pending} onClick={() => start(() => router.refresh())}><RefreshCw aria-hidden="true" className="h-4 w-4" />{pending ? "Actualizando…" : "Actualizar"}</Button>;
}
