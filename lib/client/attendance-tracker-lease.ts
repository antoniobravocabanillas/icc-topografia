export type AttendanceTrackerLease = {
  owner: string;
  expiresAt: number;
};

export function attendanceTrackerErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("details" in error)) return null;
  const details = error.details;
  if (!details || typeof details !== "object" || !("code" in details)) return null;
  return typeof details.code === "string" ? details.code : null;
}

type LeaseStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readLease(storage: LeaseStorage, key: string): AttendanceTrackerLease | null {
  try {
    const value = JSON.parse(storage.getItem(key) || "null") as Partial<AttendanceTrackerLease> | null;
    return value && typeof value.owner === "string" && Number.isFinite(value.expiresAt)
      ? { owner: value.owner, expiresAt: value.expiresAt! }
      : null;
  } catch {
    return null;
  }
}

export function claimAttendanceTrackerLease(
  storage: LeaseStorage,
  key: string,
  owner: string,
  now: number,
  durationMs: number,
) {
  const current = readLease(storage, key);
  if (current && current.owner !== owner && current.expiresAt > now) return false;
  try {
    storage.setItem(key, JSON.stringify({ owner, expiresAt: now + durationMs }));
    return readLease(storage, key)?.owner === owner;
  } catch {
    // Sin storage compartido no existe un arbitraje posible. Se prioriza no perder el recorrido.
    return true;
  }
}

export function renewAttendanceTrackerLease(
  storage: LeaseStorage,
  key: string,
  owner: string,
  now: number,
  durationMs: number,
) {
  const current = readLease(storage, key);
  if (!current || current.owner !== owner) return false;
  try {
    storage.setItem(key, JSON.stringify({ owner, expiresAt: now + durationMs }));
    return readLease(storage, key)?.owner === owner;
  } catch {
    return true;
  }
}

export function releaseAttendanceTrackerLease(storage: LeaseStorage, key: string, owner: string) {
  if (readLease(storage, key)?.owner !== owner) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function isAttendanceTrackerLeaseOwnedBy(
  storage: LeaseStorage,
  key: string,
  owner: string,
  now: number,
) {
  const current = readLease(storage, key);
  return current?.owner === owner && current.expiresAt > now;
}
