"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type PulseEvent = {
  id: string;
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
const soundKey = "icc-admin-sound-enabled";

export function AdminNotificationMonitor() {
  const [event, setEvent] = useState<PulseEvent | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const initializedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setSoundEnabled(window.localStorage.getItem(soundKey) === "1");

    async function poll() {
      try {
        const response = await fetch("/api/admin/notifications/pulse", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as PulsePayload;
        setUnreadCount(payload.unreadNotifications);
        if (!payload.latestEvent) return;

        const lastSeen = window.localStorage.getItem(storageKey);
        if (!initializedRef.current) {
          initializedRef.current = true;
          window.localStorage.setItem(storageKey, payload.latestEvent.id);
          return;
        }

        if (payload.latestEvent.id !== lastSeen) {
          window.localStorage.setItem(storageKey, payload.latestEvent.id);
          setEvent(payload.latestEvent);
          setIsVisible(true);
          if (window.localStorage.getItem(soundKey) === "1") playNotificationSound();
        }
      } catch {
        // The monitor is non-critical; failed polls should not interrupt admin work.
      }
    }

    poll();
    const interval = window.setInterval(poll, 12000);
    return () => window.clearInterval(interval);
  }, []);

  async function enableSound() {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    audioContextRef.current = audioContextRef.current || new AudioContextClass();
    if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume();
    window.localStorage.setItem(soundKey, "1");
    setSoundEnabled(true);
    playNotificationSound();
  }

  function playNotificationSound() {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = audioContextRef.current || new AudioContextClass();
    audioContextRef.current = context;
    if (context.state === "suspended") return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(660, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.34);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] flex-col items-end gap-3">
      {!soundEnabled ? (
        <Button type="button" variant="outline" size="sm" className="border-primary/30 bg-background shadow-lg" onClick={enableSound}>
          <Volume2 className="h-4 w-4" />
          Activar sonido
        </Button>
      ) : null}

      {isVisible && event ? (
        <div className="w-[360px] max-w-full rounded-lg border bg-background p-4 shadow-technical">
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
        <Link href="/admin/notificaciones" className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-semibold shadow-lg">
          <Bell className="h-4 w-4 text-primary" />
          {unreadCount} sin leer
        </Link>
      ) : null}
    </div>
  );
}
