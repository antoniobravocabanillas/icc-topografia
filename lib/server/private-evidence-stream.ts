import type { PrivateEvidenceStreamStore } from "./media";

export class PrivateEvidenceReadError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Deadline covers acquisition and every read. Cancellation is best effort;
 * a provider that never settles cancel must not keep the request alive. */
export async function readPrivateEvidenceStream(store: PrivateEvidenceStreamStore, key: string, expectedSize: number) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > 4 * 1024 * 1024)
    throw new PrivateEvidenceReadError("Archivo no disponible.", 409);
  let expired = false, completed = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer!: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(new PrivateEvidenceReadError("La lectura agotó su tiempo.", 504)); }, 10000);
  });
  const acquiring = Promise.resolve().then(() => store.getStream(key)).then(result => {
    if (expired && result) void result.data.cancel().catch(() => undefined);
    return result;
  });
  try {
    const result = await Promise.race([acquiring, deadline]);
    if (!result) throw new PrivateEvidenceReadError("Archivo no disponible.", 404);
    reader = result.data.getReader();
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) { completed = true; break; }
      total += value.byteLength;
      if (total > expectedSize) throw new PrivateEvidenceReadError("El archivo no coincide con su registro.", 409);
      // Copy bounded chunks so a source cannot mutate already validated bytes.
      chunks.push(Uint8Array.from(value));
    }
    if (total !== expectedSize) throw new PrivateEvidenceReadError("El archivo no coincide con su registro.", 409);
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally {
    clearTimeout(timer);
    if (reader) {
      if (!completed) void reader.cancel().catch(() => undefined);
      try { reader.releaseLock(); } catch { /* A timed-out provider can still have a pending read. */ }
    }
  }
}
