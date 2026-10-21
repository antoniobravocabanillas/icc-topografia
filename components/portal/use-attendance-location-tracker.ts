"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  attendanceLocationScope,
  listQueuedAttendanceLocationsForScope,
  queueAttendanceLocation,
  removeQueuedAttendanceLocations,
  selectAttendanceLocationBatch,
  type QueuedAttendanceLocation,
} from "@/lib/client/attendance-location-queue";
import {
  attendanceTrackerErrorCode,
  claimAttendanceTrackerLease,
  isAttendanceTrackerLeaseOwnedBy,
  releaseAttendanceTrackerLease,
  renewAttendanceTrackerLease,
} from "@/lib/client/attendance-tracker-lease";
import { requestFieldVerification } from "@/components/terraqo/field-verification-panel";

type TrackingState = "idle" | "active" | "offline" | "standby" | "remote" | "blocked" | "error";

const MIN_SAMPLE_INTERVAL_MS = 60_000;
const MIN_MOVEMENT_METERS = 25;
const MAX_ACCURACY_METERS = 150;
const LEASE_DURATION_MS = 75_000;
const LEASE_POLL_INTERVAL_MS = 15_000;

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

export function useAttendanceLocationTracker(input: { endpoint: string; attendanceId: string | null; userId: string }) {
  const [state, setState] = useState<TrackingState>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const flushingRef = useRef(false);
  const ownsLeaseRef = useRef(false);
  const remoteOwnershipRef = useRef(false);
  const ownerRef = useRef(typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const scopeKey = attendanceLocationScope(input.userId, input.endpoint);

  const refreshPendingCount = useCallback(async () => {
    try {
      setPendingCount((await listQueuedAttendanceLocationsForScope(scopeKey, input.attendanceId, new Set(), 1_500)).length);
    } catch {
      setState("error");
    }
  }, [input.attendanceId, scopeKey]);

  const flushQueued = useCallback(async () => {
    if (flushingRef.current || typeof navigator === "undefined" || !navigator.onLine) return;
    flushingRef.current = true;
    const failedAttendanceIds = new Set<string>();
    try {
      for (let cycle = 0; cycle < 15; cycle += 1) {
        const queued = await listQueuedAttendanceLocationsForScope(
          scopeKey,
          input.attendanceId,
          failedAttendanceIds,
          1_500,
        );
        const batch = selectAttendanceLocationBatch(
          queued, scopeKey, input.attendanceId, failedAttendanceIds, 100,
        );
        if (!batch.length) break;
        try {
          await requestFieldVerification(input.endpoint, {
            action: "location_samples_sync",
            data: {
              attendanceId: batch[0].attendanceId,
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
        } catch (error) {
          if (attendanceTrackerErrorCode(error) === "LOCATION_TRACKER_OWNED_BY_ANOTHER_BROWSER") {
            // Son muestras del navegador no autorizado y nunca podrán sincronizarse desde él.
            const rejectedAttendanceId = batch[0].attendanceId;
            await removeQueuedAttendanceLocations(
              queued.filter((sample) => sample.attendanceId === rejectedAttendanceId).map((sample) => sample.clientSampleId),
            );
            if (rejectedAttendanceId === input.attendanceId) {
              remoteOwnershipRef.current = true;
              setState("remote");
              break;
            }
            failedAttendanceIds.add(rejectedAttendanceId);
            continue;
          }
          // Una jornada antigua no debe bloquear la sincronización de las demás.
          failedAttendanceIds.add(batch[0].attendanceId);
        }
      }
    } finally {
      flushingRef.current = false;
      await refreshPendingCount();
    }
  }, [input.attendanceId, input.endpoint, refreshPendingCount, scopeKey]);

  useEffect(() => {
    void refreshPendingCount();
    void flushQueued();
    const online = () => {
      setState(input.attendanceId ? remoteOwnershipRef.current ? "remote" : ownsLeaseRef.current ? "active" : "standby" : "idle");
      void flushQueued();
    };
    const offline = () => setState(input.attendanceId ? remoteOwnershipRef.current ? "remote" : ownsLeaseRef.current ? "offline" : "standby" : "idle");
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
      ownsLeaseRef.current = false;
      remoteOwnershipRef.current = false;
      setState(input.attendanceId ? "error" : "idle");
      return;
    }

    const leaseKey = `terraqo-attendance-tracker:${input.attendanceId}`;
    const owner = ownerRef.current;
    remoteOwnershipRef.current = false;
    let lastAccepted: { coordinates: GeolocationCoordinates; capturedAt: number } | null = null;
    let watchId: number | null = null;

    const stopWatch = (nextState: TrackingState = "standby") => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      ownsLeaseRef.current = false;
      setState(nextState);
    };

    const startWatch = () => {
      if (watchId !== null) return;
      if (remoteOwnershipRef.current) {
        setState("remote");
        return;
      }
      if (!claimAttendanceTrackerLease(localStorage, leaseKey, owner, Date.now(), LEASE_DURATION_MS)) {
        ownsLeaseRef.current = false;
        setState("standby");
        return;
      }
      ownsLeaseRef.current = true;
      setState(navigator.onLine ? "active" : "offline");
      watchId = navigator.geolocation.watchPosition((position) => {
        if (position.coords.accuracy > MAX_ACCURACY_METERS) return;
        const moved = lastAccepted ? distanceMeters(lastAccepted.coordinates, position.coords) : Number.POSITIVE_INFINITY;
        const elapsed = lastAccepted ? position.timestamp - lastAccepted.capturedAt : Number.POSITIVE_INFINITY;
        if (elapsed < MIN_SAMPLE_INTERVAL_MS && moved < MIN_MOVEMENT_METERS) return;
        lastAccepted = { coordinates: position.coords, capturedAt: position.timestamp };
        const sample: QueuedAttendanceLocation = {
          attendanceId: input.attendanceId!,
          clientSampleId: crypto.randomUUID(),
          scopeKey,
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
    };

    startWatch();
    const leaseTimer = window.setInterval(() => {
      if (remoteOwnershipRef.current) {
        stopWatch("remote");
        return;
      }
      if (watchId === null) {
        startWatch();
        return;
      }
      if (!renewAttendanceTrackerLease(localStorage, leaseKey, owner, Date.now(), LEASE_DURATION_MS)) {
        stopWatch();
      }
    }, LEASE_POLL_INTERVAL_MS);
    const handleLeaseChange = (event: StorageEvent) => {
      if (event.key !== leaseKey) return;
      if (watchId !== null && !isAttendanceTrackerLeaseOwnedBy(localStorage, leaseKey, owner, Date.now())) {
        stopWatch();
      } else if (watchId === null) {
        startWatch();
      }
    };
    window.addEventListener("storage", handleLeaseChange);

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      ownsLeaseRef.current = false;
      window.clearInterval(leaseTimer);
      window.removeEventListener("storage", handleLeaseChange);
      releaseAttendanceTrackerLease(localStorage, leaseKey, owner);
      void flushQueued();
    };
  }, [flushQueued, input.attendanceId, refreshPendingCount, scopeKey]);

  return { state, pendingCount, syncedCount, flushQueued };
}
