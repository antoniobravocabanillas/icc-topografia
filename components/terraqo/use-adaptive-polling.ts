"use client";

import { useEffect, useRef } from "react";

import {
  nextAdaptivePollingDelay,
  type AdaptivePollingPolicy,
} from "@/lib/terraqo/adaptive-polling";

type AdaptivePoll = (signal: AbortSignal) => Promise<boolean>;

type AdaptivePollingOptions = {
  enabled?: boolean;
  policy: AdaptivePollingPolicy;
  refreshEvents?: readonly string[];
};

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}

export function useAdaptivePolling(
  poll: AdaptivePoll,
  {
    enabled = true,
    policy,
    refreshEvents = [],
  }: AdaptivePollingOptions,
) {
  const pollRef = useRef(poll);
  pollRef.current = poll;
  const refreshEventKey = refreshEvents.join("\u0000");

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let running = false;
    let pendingImmediatePoll = false;
    let unchangedPolls = 0;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    const customEvents = refreshEventKey
      ? refreshEventKey.split("\u0000")
      : [];

    const canPoll = () =>
      document.visibilityState === "visible" && navigator.onLine !== false;

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      if (stopped || !canPoll()) return;
      timer = window.setTimeout(() => void run(), delayMs);
    };

    async function run() {
      timer = null;
      if (stopped || !canPoll()) return;
      if (running) {
        pendingImmediatePoll = true;
        return;
      }

      running = true;
      pendingImmediatePoll = false;
      const currentController = new AbortController();
      controller = currentController;

      try {
        const changed = await pollRef.current(currentController.signal);
        unchangedPolls = changed ? 0 : unchangedPolls + 1;
      } catch (error) {
        if (!isAbortError(error)) unchangedPolls = 0;
      } finally {
        if (controller === currentController) controller = null;
        running = false;
        if (stopped) return;
        if (pendingImmediatePoll && canPoll()) {
          pendingImmediatePoll = false;
          schedule(0);
          return;
        }
        schedule(nextAdaptivePollingDelay(unchangedPolls, policy));
      }
    }

    const pause = () => {
      clearTimer();
      pendingImmediatePoll = false;
      controller?.abort();
    };

    const wake = () => {
      unchangedPolls = 0;
      if (!canPoll()) return;
      if (running) {
        pendingImmediatePoll = true;
        return;
      }
      schedule(0);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") wake();
      else pause();
    };

    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", pause);
    document.addEventListener("visibilitychange", handleVisibility);
    for (const eventName of customEvents) {
      window.addEventListener(eventName, wake);
    }
    wake();

    return () => {
      stopped = true;
      pause();
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", pause);
      document.removeEventListener("visibilitychange", handleVisibility);
      for (const eventName of customEvents) {
        window.removeEventListener(eventName, wake);
      }
    };
  }, [enabled, policy, refreshEventKey]);
}
