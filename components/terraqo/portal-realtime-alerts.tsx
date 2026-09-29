"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, MessagesSquare, Settings2, X } from "lucide-react";

import { AlertPreferencesPanel } from "@/components/terraqo/alert-preferences";
import {
  installTerraqoAudioUnlock,
  playTerraqoAlert,
} from "@/lib/terraqo/alert-sounds";

type AlertEvent = {
  id: string;
  channel: "message" | "notification";
  title: string;
  body: string;
  href: string;
  createdAt: string;
};

type PulseData = {
  unreadMessages: number;
  unreadNotifications: number;
  latestEvent: AlertEvent | null;
};

export function PortalRealtimeAlerts({
  currentUserId,
  messagesEnabled = true,
}: {
  currentUserId: string;
  messagesEnabled?: boolean;
}) {
  const [pulse, setPulse] = useState<PulseData>({
    unreadMessages: 0,
    unreadNotifications: 0,
    latestEvent: null,
  });
  const [toast, setToast] = useState<AlertEvent | null>(null);
  const initializedRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const latestKey = `terraqo:latest-alert:${currentUserId}`;

  const poll = useCallback(async () => {
    if (!navigator.onLine || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/terraqo/activity-pulse", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { data?: PulseData };
      if (!payload.data) return;
      setPulse(payload.data);
      window.dispatchEvent(
        new CustomEvent("terraqo:realtime-counts", { detail: payload.data }),
      );
      if (!payload.data.latestEvent) return;
      const latestId = payload.data.latestEvent.id;
      const previousId = window.localStorage.getItem(latestKey);
      if (!initializedRef.current) {
        initializedRef.current = true;
        window.localStorage.setItem(latestKey, latestId);
        return;
      }
      if (latestId !== previousId) {
        window.localStorage.setItem(latestKey, latestId);
        if (
          payload.data.latestEvent.channel === "message" &&
          !messagesEnabled
        )
          return;
        setToast(payload.data.latestEvent);
        await playTerraqoAlert(payload.data.latestEvent.channel);
        if (payload.data.latestEvent.channel === "message") {
          window.dispatchEvent(new CustomEvent("terraqo:messages-changed"));
        }
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        // Realtime alerts are non-blocking; the next pulse retries automatically.
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [latestKey, messagesEnabled]);

  useEffect(() => {
    installTerraqoAudioUnlock();
    void poll();
    const interval = window.setInterval(() => void poll(), 4000);
    const refresh = () => void poll();
    const visibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("terraqo:message-sent", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(interval);
      requestRef.current?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("terraqo:message-sent", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [poll]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <>
      {messagesEnabled ? (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("terraqo:open-messages"))}
          className="relative grid h-11 w-11 place-items-center rounded-xl border border-[#d8e0ec] text-[#35485b] transition-colors hover:bg-[#e8eef7] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315f9f]"
          aria-label={pulse.unreadMessages ? `Abrir mensajes, ${pulse.unreadMessages} sin leer` : "Abrir mensajes"}
        >
          <MessagesSquare className="h-[18px] w-[18px]" aria-hidden="true" />
          <CountBadge count={pulse.unreadMessages} />
        </button>
      ) : null}

      <details className="group relative" data-portal-popover>
        <summary
          className="relative grid h-11 w-11 cursor-pointer list-none place-items-center rounded-xl border border-[#d8e0ec] text-[#35485b] transition-colors hover:bg-[#e8eef7] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315f9f] [&::-webkit-details-marker]:hidden"
          aria-label={pulse.unreadNotifications ? `Notificaciones y sonido, ${pulse.unreadNotifications} sin leer` : "Notificaciones y sonido"}
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
          <CountBadge count={pulse.unreadNotifications} />
        </summary>
        <div className="fixed inset-x-3 top-[72px] z-[80] rounded-2xl border border-[#d8e0ec] bg-white p-4 shadow-[0_24px_65px_rgba(14,26,38,0.22)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+10px)]">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <p className="text-sm font-bold text-[#0e1a26]">Centro de alertas</p>
              <p className="mt-0.5 text-xs text-[#607083]">
                {(messagesEnabled ? pulse.unreadMessages : 0) + pulse.unreadNotifications
                  ? `${(messagesEnabled ? pulse.unreadMessages : 0) + pulse.unreadNotifications} pendientes`
                  : "Estás al día"}
              </p>
            </div>
            <Settings2 className="h-5 w-5 text-[#315f9f]" aria-hidden="true" />
          </div>
          <AlertPreferencesPanel />
          <Link
            href="/portal#actividad"
            className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-[#0b6f68] px-4 text-sm font-bold text-white transition-colors hover:bg-[#095f59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6f68] focus-visible:ring-offset-2"
          >
            Ver actividad reciente
          </Link>
        </div>
      </details>

      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[90] flex justify-end sm:inset-x-auto sm:right-5 sm:w-[380px]" aria-live="polite" aria-atomic="true">
        {toast ? (
          <article className="pointer-events-auto w-full rounded-2xl border border-[#d8e0ec] bg-white p-4 text-[#0e1a26] shadow-[0_24px_65px_rgba(14,26,38,0.22)]">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e9f6f5] text-[#0b6f68]">
                {toast.channel === "message" ? <MessagesSquare className="h-5 w-5" aria-hidden="true" /> : <BellRing className="h-5 w-5" aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{toast.title}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#526579]">{toast.body}</p>
              </div>
              <button type="button" onClick={() => setToast(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#607083] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315f9f]" aria-label="Cerrar alerta">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <time className="text-[11px] text-[#607083]">{new Date(toast.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</time>
              <Link href={toast.href} onClick={() => setToast(null)} className="inline-flex min-h-10 items-center rounded-xl bg-[#315f9f] px-4 text-xs font-bold text-white hover:bg-[#284f85] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315f9f] focus-visible:ring-offset-2">
                Abrir
              </Link>
            </div>
          </article>
        ) : null}
      </div>
    </>
  );
}

function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-[#c83d4a] px-1 text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
