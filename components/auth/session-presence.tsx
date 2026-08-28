"use client";

import { signOut } from "next-auth/react";
import { useEffect } from "react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];

async function markOffline() {
  await fetch("/api/auth/presence", { method: "DELETE", keepalive: true }).catch(() => null);
}

export function SessionPresence() {
  useEffect(() => {
    let lastActivity = Date.now();
    let idleTimer: ReturnType<typeof setTimeout>;
    let closing = false;

    const closeInactiveSession = async () => {
      if (closing) return;
      closing = true;
      await markOffline();
      await signOut({ redirect: false });
      const query = new URLSearchParams({ reason: "inactive" });
      window.location.assign(`/cuenta${String.fromCharCode(63)}${query.toString()}`);
    };

    const scheduleIdleClose = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(closeInactiveSession, Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - lastActivity)));
    };

    const registerActivity = () => {
      lastActivity = Date.now();
      scheduleIdleClose();
    };

    const heartbeat = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastActivity >= IDLE_TIMEOUT_MS) return;
      void fetch("/api/auth/presence", { method: "POST", keepalive: true });
    };

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, registerActivity, { passive: true }));
    document.addEventListener("visibilitychange", heartbeat);
    heartbeat();
    scheduleIdleClose();
    const interval = window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearTimeout(idleTimer);
      window.clearInterval(interval);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, registerActivity));
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, []);

  return null;
}
