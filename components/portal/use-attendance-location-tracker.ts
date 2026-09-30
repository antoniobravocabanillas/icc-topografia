"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  listQueuedAttendanceLocations,
  queueAttendanceLocation,
  removeQueuedAttendanceLocations,
  type QueuedAttendanceLocation,
} from "@/lib/client/attendance-location-queue";
import { requestFieldVerification } from "@/components/terraqo/field-verification-panel";

type TrackingState = "idle" | "active" | "offline" | "blocked" | "error";

const MIN_SAMPLE_INTERVAL_MS = 60_000;
const MIN_MOVEMENT_METERS = 25;
const MAX_ACCURACY_METERS = 150;
const LEASE_DURATION_MS = 75_000;

function distanceMeters(left: GeolocationCoordinates, right: GeolocationCoordinates) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const latitude1 = radians(left.latitude);
  const latitude2 = radians(right.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function useAttendanceLocationTracker(input: { endpoint: string; attendanceId: string | null }) {
  const [state, setState] = useState<TrackingState>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const flushingRef = useRef(false);
  const ownerRef = useRef(typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  const refreshPendingCount = useCallback(async () => {
    try {
      setPendingCount((await listQueuedAttendanceLocations(1_501)).length);
    } catch {
      setState("error");
    }
  }, []);

  const flushQueued = useCallback(async () => {
    if (flushingRef.current || typeof navigator === "undefined" || !navigator.onLine) return;
    flushingRef.current = true;
    try {
      for (let cycle = 0; cycle < 15; cycle += 1) {
        const queued = await listQueuedAttendanceLocations(100);
        if (!queued.length) break;
        const attendanceId = queued[0].attendanceId;
        const batch = queued.filter((sample) => sample.attendanceId === attendanceId).slice(0, 100);
        await requestFieldVerification(input.endpoint, {
          action: "location_samples_sync",
          data: {
            attendanceId,
            samples: batch.map(({ clientSampleId, latitude, longitude, accuracyMeters, capturedAt }) => ({
              clientSampleId,
              latitude,
              longitude,
              accuracyMeters,
              capturedAt,
            })),
          },
        });
        await removeQueuedAttendanceLocations(batch.map((sample) => sample.clientSampleId));
        setSyncedCount((count) => count + batch.length);
      }
    } catch {
      // La cola se conserva completa para el siguiente intento.
    } finally {
      flushingRef.current = false;
      await refreshPendingCount();
    }
  }, [input.endpoint, refreshPendingCount]);

  useEffect(() => {
    void refreshPendingCount();
    void flushQueued();
    const online = () => {
      setState(input.attendanceId ? "active" : "idle");
      void flushQueued();
    };
    const offline = () => setState(input.attendanceId ? "offline" : "idle");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const timer = window.setInterval(() => void flushQueued(), 60_000);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.clearInterval(timer);
    };
  }, [flushQueued, input.attendanceId, refreshPendingCount]);

  useEffect(() => {
    if (!input.attendanceId || !navigator.geolocation) {
      setState(input.attendanceId ? "error" : "idle");
      return;
    }

    const leaseKey = `terraqo-attendance-tracker:${input.attendanceId}`;
    const owner = ownerRef.current;
    const claimLease = () => {
      try {
        const current = JSON.parse(localStorage.getItem(leaseKey) || "null") as { owner?: string; expiresAt?: number } | null;
        if (current?.owner !== owner && (current?.expiresAt || 0) > Date.now()) return false;
        localStorage.setItem(leaseKey, JSON.stringify({ owner, expiresAt: Date.now() + LEASE_DURATION_MS }));
        return true;
      } catch {
        return true;
      }
    };

    if (!claimLease()) return;
    setState(navigator.onLine ? "active" : "offline");
    let lastAccepted: { coordinates: GeolocationCoordinates; capturedAt: number } | null = null;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (position.coords.accuracy > MAX_ACCURACY_METERS) return;
        const moved = lastAccepted ? distanceMeters(lastAccepted.coordinates, position.coords) : Number.POSITIVE_INFINITY;
        const elapsed = lastAccepted ? position.timestamp - lastAccepted.capturedAt : Number.POSITIVE_INFINITY;
        if (elapsed < MIN_SAMPLE_INTERVAL_MS && moved < MIN_MOVEMENT_METERS) return;
        lastAccepted = { coordinates: position.coords, capturedAt: position.timestamp };
        const sample: QueuedAttendanceLocation = {
          attendanceId: input.attendanceId!,
          clientSampleId: crypto.randomUUID(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
        };
        void queueAttendanceLocation(sample)
          .then(async () => {
            await refreshPendingCount();
            if (navigator.onLine) await flushQueued();
          })
          .catch(() => setState("error"));
      },
      (error) => setState(error.code === error.PERMISSION_DENIED ? "blocked" : navigator.onLine ? "error" : "offline"),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 },
    );
    const leaseTimer = window.setInterval(() => {
      try {
        localStorage.setItem(leaseKey, JSON.stringify({ owner, expiresAt: Date.now() + LEASE_DURATION_MS }));
      } catch {
        // La captura puede continuar aunque el navegador bloquee localStorage.
      }
    }, 30_000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(leaseTimer);
      try {
        const current = JSON.parse(localStorage.getItem(leaseKey) || "null") as { owner?: string } | null;
        if (current?.owner === owner) localStorage.removeItem(leaseKey);
      } catch {
        // Sin limpieza de lease; expirará automáticamente.
      }
      void flushQueued();
    };
  }, [flushQueued, input.attendanceId, refreshPendingCount]);

  return { state, pendingCount, syncedCount, flushQueued };
}
