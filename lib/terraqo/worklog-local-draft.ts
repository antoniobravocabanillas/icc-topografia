"use client";

const DATABASE_NAME = "terraqo-offline-drafts";
const STORE_NAME = "worklog-drafts";
const DATABASE_VERSION = 1;

export type WorklogDraftFields = {
  workspaceId: string;
  projectId: string;
  previousWorklogId: string;
  title: string;
  summary: string;
  outcome: string;
  contributionRole: string;
  responsibilities: string;
  methods: string;
  tools: string;
  type: string;
  visibility: string;
  skills: string;
  evidenceUrls: string;
  locationLabel: string;
  includeAutomaticLocation: boolean;
};

type StoredPhoto = {
  name: string;
  type: string;
  lastModified: number;
  bytes: Blob;
};

type StoredWorklogDraft = {
  key: string;
  schemaVersion: 1;
  fields: WorklogDraftFields;
  photos: StoredPhoto[];
  serverWorklogId: string | null;
  operationKey: string | null;
  updatedAt: string;
};

export type WorklogLocalDraft = Omit<StoredWorklogDraft, "photos"> & {
  photos: File[];
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir el borrador local."));
  });
}

async function runStoreRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("No se pudo actualizar el borrador local."));
      transaction.onabort = () => reject(transaction.error || new Error("La actualización local fue cancelada."));
    });
  } finally {
    database.close();
  }
}

export async function saveWorklogLocalDraft(input: {
  key: string;
  fields: WorklogDraftFields;
  photos: File[];
  serverWorklogId?: string | null;
  operationKey?: string | null;
}) {
  const record: StoredWorklogDraft = {
    key: input.key,
    schemaVersion: 1,
    fields: input.fields,
    photos: input.photos.map((photo) => ({
      name: photo.name,
      type: photo.type,
      lastModified: photo.lastModified,
      bytes: photo,
    })),
    serverWorklogId: input.serverWorklogId || null,
    operationKey: input.operationKey || null,
    updatedAt: new Date().toISOString(),
  };
  await runStoreRequest("readwrite", (store) => store.put(record));
  return record.updatedAt;
}

export async function loadWorklogLocalDraft(key: string): Promise<WorklogLocalDraft | null> {
  const record = await runStoreRequest<StoredWorklogDraft | undefined>("readonly", (store) => store.get(key));
  if (!record || record.schemaVersion !== 1) return null;
  return {
    ...record,
    photos: record.photos.map(
      (photo) =>
        new File([photo.bytes], photo.name, {
          type: photo.type,
          lastModified: photo.lastModified,
        }),
    ),
  };
}

export async function deleteWorklogLocalDraft(key: string) {
  await runStoreRequest("readwrite", (store) => store.delete(key));
}
