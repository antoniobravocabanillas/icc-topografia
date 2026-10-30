"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertPreferencesPanel } from "@/components/terraqo/alert-preferences";
import {
  installTerraqoAudioUnlock,
  playTerraqoAlert,
} from "@/lib/terraqo/alert-sounds";
import { ALERT_POLLING_POLICY } from "@/lib/terraqo/adaptive-polling";
import { useAdaptivePolling } from "@/components/terraqo/use-adaptive-polling";

type PulseEvent = {
  id: string;
  type?: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
};

type PulsePayload = {
  unreadNotifications: number;
  latestEvent: PulseEvent | null;
};

const storageKey = "icc-admin-latest-event";
export function AdminNotificationMonitor() {
  const [event, setEvent] = useState<PulseEvent | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const initializedRef = useRef(false);
  const snapshotRef = useRef("");

  const poll = useCallback(async (signal: AbortSignal) => {
    const response = await fetch("/api/admin/notifications/pulse", {
      cache: "no-store",
      signal,
    });
    if (!response.ok) return false;
    const payload = await response.json() as PulsePayload;
    const nextSnapshot = JSON.stringify([
      payload.unreadNotifications,
      payload.latestEvent?.id || null,
    ]);
    const changed = snapshotRef.current !== nextSnapshot;
    snapshotRef.current = nextSnapshot;
    setUnreadCount(payload.unreadNotifications);

    const latestEvent = payload.latestEvent;
    const latestId = latestEvent?.id || "";
    const lastSeen = window.localStorage.getItem(storageKey);
    if (!initializedRef.current) {
      initializedRef.current = true;
      if (latestId) window.localStorage.setItem(storageKey, latestId);
      return changed;
    }
    if (!latestEvent || latestId === lastSeen) return changed;

    window.localStorage.setItem(storageKey, latestId);
    setEvent(latestEvent);
    setIsVisible(true);
    await playTerraqoAlert(
      latestEvent.type === "notification" ? "notification" : "message",
    );
    return changed;
  }, []);

  useEffect(() => {
    installTerraqoAudioUnlock();
  }, []);

  useAdaptivePolling(poll, { policy: ALERT_POLLING_POLICY });

  return (
    <aside aria-label="Avisos y preferencias de sonido" className="mb-6 flex flex-wrap items-center justify-end gap-3">
      <details className="group relative order-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border bg-background px-3 text-sm font-bold shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          Sonidos
        </summary>
        <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-[min(394px,calc(100vw-2rem))] rounded-2xl border bg-white p-4 text-slate-900 shadow-2xl">
          <AlertPreferencesPanel className="w-full" />
        </div>
      </details>

      {isVisible && event ? (
        <div className="order-last w-full rounded-lg border bg-background p-4 shadow-technical">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BellRing className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">{event.title}</p>
                <p className="mt-1 line-clamp-3 text-sm leading-5 text-muted-foreground">{event.body}</p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Cerrar aviso" onClick={() => setIsVisible(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString("es-PE")}</span>
            <Button asChild size="sm">
              <Link href={event.href}>Abrir</Link>
            </Button>
          </div>
        </div>
      ) : unreadCount > 0 ? (
        <Link href="/admin/notificaciones" className="order-1 flex min-h-11 items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-semibold shadow-lg">
          <Bell className="h-4 w-4 text-primary" />
          {unreadCount} sin leer
        </Link>
      ) : null}
    </aside>
  );
}
