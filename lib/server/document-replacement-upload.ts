import "server-only";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { PrismaClient } from "@prisma/client";
import { validatePrivateProfessionalFile } from "./professional-file-validation";
import { DocumentLifecycleError } from "./professional-document-lifecycle";
import { reserveDocumentReplacementInTransaction, commitDocumentReplacementInTransaction, fenceDocumentReplacementCleanupInTransaction } from "./document-replacement-attempt";

const transactionOptions = { maxWait: 1000, timeout: 7000 };
type Store = { set(key: string, data: ArrayBuffer): Promise<unknown> };
export class ReplacementUploadUnconfirmed extends Error {
  readonly status = 503;
  constructor() { super("No se pudo confirmar la carga. Consulta el expediente antes de reintentar con la misma clave."); }
}

/** Internal service, no HTTP route yet. Caller must authenticate actor and bound
 * the multipart before constructing File; database/store are server-owned ports.
 * New replacement accepts validated PDF/images. Legacy uploads are unchanged.
 */
export async function uploadDocumentReplacement(database: Pick<PrismaClient, "$transaction">, store: Store,
  input: { actorId: string; documentId: string; operationKey: string; expectedVersion: number; file: File }) {
  const deadline = performance.now() + 50000;
  const requireTime = (ms: number) => { if (deadline - performance.now() < ms) throw new ReplacementUploadUnconfirmed(); };
  requireTime(35000);
  if (!(input.file instanceof File) || input.file.size < 1 || input.file.size > 10485760) throw new DocumentLifecycleError("El archivo debe pesar como máximo 10 MB.", 422);
  const invalid = await validatePrivateProfessionalFile(input.file);
  if (invalid) throw new DocumentLifecycleError(invalid, 422);
  const bytes = await input.file.arrayBuffer();
  const file = { fileName: input.file.name, contentType: input.file.type, size: bytes.byteLength,
    contentSha256: createHash("sha256").update(new Uint8Array(bytes)).digest("hex") };
  requireTime(31000);
  const reserved = await database.$transaction(async tx => {
    requireTime(31000);
    const result = await reserveDocumentReplacementInTransaction(tx, { ...input, file });
    requireTime(23000); return result;
  }, transactionOptions);
  if (reserved.kind === "receipt") return { id: reserved.id, replayed: true };
  const attempt = reserved.attempt;
  const fence = async () => {
    if (deadline - performance.now() < 10000) return; // Durable RESERVED is sweepable.
    await database.$transaction(async tx => {
      requireTime(10000);
      await fenceDocumentReplacementCleanupInTransaction(tx, input.actorId, attempt.id);
      requireTime(2000);
    }, transactionOptions).catch(() => undefined);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    requireTime(23000);
    // Timeout does not cancel the provider. A late write has no commit continuation;
    // durable cleanup/tombstone watch removes its bytes without repeated refunds.
    try {
      await Promise.race([Promise.resolve().then(() => store.set(attempt.storageKey, bytes)), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ReplacementUploadUnconfirmed()), 5000);
      })]);
    } finally { if (timer) clearTimeout(timer); }
    requireTime(18000);
    const result = await database.$transaction(async tx => {
      requireTime(18000);
      const committed = await commitDocumentReplacementInTransaction(tx, input.actorId, attempt.id);
      requireTime(10000); return committed;
    }, transactionOptions);
    // Duplicate finalization already commits CLEANUP_PENDING. No physical delete
    // or refund happens inside an HTTP request, including uncertain SQL outcomes.
    return { id: result.id, replayed: result.replayed };
  } catch (error) {
    await fence();
    throw error;
  }
}
