export type QueuedAttendanceLocation = {
  attendanceId: string;
  clientSampleId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

const DATABASE_NAME = "terraqo-attendance-v1";
const STORE_NAME = "locationSamples";
const MAX_LOCAL_SAMPLES = 1_500;

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
  const queued = await listQueuedAttendanceLocations(MAX_LOCAL_SAMPLES + 1);
  if (queued.length > MAX_LOCAL_SAMPLES) {
    await removeQueuedAttendanceLocations(queued.slice(0, queued.length - MAX_LOCAL_SAMPLES).map((item) => item.clientSampleId));
  }
}

export async function listQueuedAttendanceLocations(limit = 500) {
  const values = await withStore<QueuedAttendanceLocation[]>("readonly", (store) => store.getAll());
  return values
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
    .slice(0, limit);
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
