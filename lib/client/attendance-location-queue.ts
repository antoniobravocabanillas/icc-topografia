export type QueuedAttendanceLocation = {
  attendanceId: string;
  clientSampleId: string;
  scopeKey?: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

const DATABASE_NAME = "terraqo-attendance-v1";
const STORE_NAME = "locationSamples";
const MAX_LOCAL_SAMPLES = 1_500;

export function attendanceLocationScope(userId: string, endpoint: string) {
  const normalizedUserId = userId.trim();
  const url = new URL(endpoint, "https://terraqo.invalid");
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  if (!normalizedUserId || !workspaceId) throw new Error("La cola de ubicación requiere usuario y workspace.");
  return `${normalizedUserId}:${workspaceId}`;
}

export function selectAttendanceLocationBatch(
  samples: QueuedAttendanceLocation[],
  scopeKey: string,
  activeAttendanceId: string | null,
  excludedAttendanceIds: ReadonlySet<string> = new Set(),
  limit = 100,
) {
  const eligible = filterAttendanceLocationsForScope(samples, scopeKey, activeAttendanceId, excludedAttendanceIds);
  const attendanceId = eligible[0]?.attendanceId;
  return attendanceId
    ? eligible.filter((sample) => sample.attendanceId === attendanceId).slice(0, limit)
    : [];
}

export function filterAttendanceLocationsForScope(
  samples: QueuedAttendanceLocation[],
  scopeKey: string,
  activeAttendanceId: string | null,
  excludedAttendanceIds: ReadonlySet<string> = new Set(),
) {
  return samples
    .filter((sample) =>
      !excludedAttendanceIds.has(sample.attendanceId)
      && (sample.scopeKey === scopeKey || (!sample.scopeKey && sample.attendanceId === activeAttendanceId)))
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
}

export function attendanceLocationIdsToPrune(samples: QueuedAttendanceLocation[], maximum = MAX_LOCAL_SAMPLES) {
  if (samples.length <= maximum) return [];
  return [...samples]
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
    .slice(0, samples.length - maximum)
    .map((sample) => sample.clientSampleId);
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("El almacenamiento offline no está disponible."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "clientSampleId" });
        store.createIndex("attendanceId", "attendanceId", { unique: false });
        store.createIndex("capturedAt", "capturedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir la cola offline."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falló la operación offline."));
    });
  } finally {
    database.close();
  }
}

export async function queueAttendanceLocation(sample: QueuedAttendanceLocation) {
  await withStore("readwrite", (store) => store.put(sample));
  const queued = await readQueuedAttendanceLocations();
  await removeQueuedAttendanceLocations(attendanceLocationIdsToPrune(queued));
}

async function readQueuedAttendanceLocations() {
  const values = await withStore<QueuedAttendanceLocation[]>("readonly", (store) => store.getAll());
  return values.sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
}

export async function listQueuedAttendanceLocations(limit = 500) {
  return (await readQueuedAttendanceLocations()).slice(0, limit);
}

export async function listQueuedAttendanceLocationsForScope(
  scopeKey: string,
  activeAttendanceId: string | null,
  excludedAttendanceIds: ReadonlySet<string> = new Set(),
  limit = 500,
) {
  return filterAttendanceLocationsForScope(
    await readQueuedAttendanceLocations(), scopeKey, activeAttendanceId, excludedAttendanceIds,
  ).slice(0, limit);
}

export async function removeQueuedAttendanceLocations(clientSampleIds: string[]) {
  if (!clientSampleIds.length) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      clientSampleIds.forEach((id) => store.delete(id));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("No se pudo limpiar la cola offline."));
    });
  } finally {
    database.close();
  }
}
