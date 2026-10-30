import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BILLING_PLANS, getBillingPlan } from "@/lib/terraqo/billing/catalog";
import { personalRetainedStorageUnits } from "@/lib/terraqo/billing/personal-storage-usage";
import {
  ALLOWED_EXPERIENCE_EVIDENCE_TYPES,
  EXPERIENCE_EVIDENCE_PREFIX,
  MAX_EXPERIENCE_EVIDENCE_SIZE,
  getWorklogEvidenceUploadStore,
  sanitizeFileName,
} from "@/lib/server/media";

export const EXPERIENCE_EVIDENCE_CHUNK_SIZE = 3 * 1024 * 1024;
export const EXPERIENCE_EVIDENCE_UPLOAD_TTL_SECONDS = 20 * 60;
const RECEIPT_TTL_SECONDS = 30 * 60;
const MAX_RECEIPTS = 6;
const MAX_PENDING_UPLOAD_BYTES = 64 * 1024 * 1024;

type PendingUploadBudget = {
  v: 1;
  uploadId: string;
  size: number;
  chunks: number;
  storageKey?: string;
  activeWrites?: Array<{ index: number; nonce: string }>;
  finalWrite?: string;
};

type UploadClaim = {
  v: 1;
  kind: "experience-evidence-upload";
  sub: string;
  uploadId: string;
  fileName: string;
  contentType: string;
  size: number;
  chunks: number;
  exp: number;
};

type EvidenceReceipt = {
  v: 1;
  kind: "experience-evidence-receipt";
  sub: string;
  uploadId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  size: number;
  chunks: number;
  sha256: string;
  exp: number;
};

export class ExperienceEvidenceUploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ExperienceEvidenceUploadError";
  }
}

function secret() {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET no está configurado para firmar cargas de evidencia.");
  return value;
}

function seal(payload: UploadClaim | EvidenceReceipt) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function open<T extends UploadClaim | EvidenceReceipt>(token: string, kind: T["kind"]): T {
  if (token.length > 8192) throw new ExperienceEvidenceUploadError("La autorización de carga no es válida.", 401);
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) throw new ExperienceEvidenceUploadError("La autorización de carga no es válida.", 401);
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new ExperienceEvidenceUploadError("La autorización de carga no es válida.", 401);
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (payload.v !== 1 || payload.kind !== kind || !payload.sub || !Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error("expired");
    }
    return payload;
  } catch {
    throw new ExperienceEvidenceUploadError("La autorización de carga venció o está dañada.", 401);
  }
}

function normalizeFileName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\\/\r\n\0]/g, "-").trim().slice(0, 180);
  return name || null;
}

function userPrefix(userId: string) {
  return createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

function pendingBudgetIdentifier(userId: string) {
  return `experience-evidence-upload:${createHash("sha256").update(userId).digest("hex")}`;
}

function encodePendingBudget(value: PendingUploadBudget) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodePendingBudget(value: string): PendingUploadBudget | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as PendingUploadBudget;
    if (parsed.v !== 1 || !/^[a-f0-9-]{36}$/.test(parsed.uploadId) || !Number.isSafeInteger(parsed.size) || parsed.size < 1 || parsed.size > MAX_EXPERIENCE_EVIDENCE_SIZE || !Number.isSafeInteger(parsed.chunks) || parsed.chunks < 1 || parsed.chunks > 3) return null;
    if (parsed.storageKey && (!parsed.storageKey.startsWith(`${EXPERIENCE_EVIDENCE_PREFIX}/pending/`) || parsed.storageKey.includes("..") || parsed.storageKey.includes("\\"))) return null;
    if (parsed.finalWrite !== undefined && (!parsed.storageKey || !/^[a-f0-9-]{36}$/.test(parsed.finalWrite))) return null;
    if (parsed.activeWrites !== undefined) {
      if (!Array.isArray(parsed.activeWrites) || parsed.activeWrites.length > parsed.chunks) return null;
      const indices = new Set<number>();
      for (const write of parsed.activeWrites) {
        if (!write || !Number.isSafeInteger(write.index) || write.index < 0 || write.index >= parsed.chunks || !/^[a-f0-9-]{36}$/.test(write.nonce) || indices.has(write.index)) return null;
        indices.add(write.index);
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

async function cleanupExpiredPendingUploads(userId: string, records: PendingUploadBudget[]) {
  if (!records.length) return;
  const store = getWorklogEvidenceUploadStore();
  const finalKeys = records.flatMap((record) => record.storageKey ? [record.storageKey] : []);
  const referenced = finalKeys.length ? await prisma.terraqoExperienceEvidence.findMany({ where: { storageKey: { in: finalKeys } }, select: { storageKey: true } }) : [];
  const retained = new Set(referenced.map((row) => row.storageKey));
  await Promise.all(records.flatMap((record) => [
    ...Array.from({ length: record.chunks }, (_, index) => store.delete(`${EXPERIENCE_EVIDENCE_PREFIX}/pending/${userPrefix(userId)}/${record.uploadId}/chunks/${index}`)),
    ...(record.storageKey && !retained.has(record.storageKey) ? [store.delete(record.storageKey)] : []),
  ]));
}

async function reservePendingUploadBudget(userId: string, record: PendingUploadBudget, expires: Date) {
  const identifier = pendingBudgetIdentifier(userId);
  const now = new Date();
  const { expired, budgetExceeded, unresolvedExpired } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${identifier}))`);
    const rows = await tx.verificationToken.findMany({ where: { identifier }, select: { token: true, expires: true } });
    const decoded = rows.map((row) => ({ ...row, record: decodePendingBudget(row.token) }));
    // Expiry invalidates a capability; it does not cancel an in-flight remote
    // PUT. Keep uncertain writes charged and recoverable until reconciled.
    if (decoded.some((row) => !row.record)) throw new ExperienceEvidenceUploadError("El presupuesto temporal de carga requiere revisión.", 409);
    const active = decoded.filter((row) => row.expires > now || row.record?.activeWrites?.length || row.record?.finalWrite);
    const activeBytes = active.reduce((sum, row) => sum + (row.record?.size || 0), 0);
    const budgetExceeded = !Number.isSafeInteger(activeBytes + record.size) || activeBytes + record.size > MAX_PENDING_UPLOAD_BYTES;
    const stale = rows.filter((row) => row.expires <= now).map((row) => ({ token: row.token, record: decodePendingBudget(row.token) })).filter((value): value is { token: string; record: PendingUploadBudget } => Boolean(value.record));
    if (!budgetExceeded) await tx.verificationToken.create({ data: { identifier, token: encodePendingBudget(record), expires } });
    return { expired: stale, budgetExceeded, unresolvedExpired: stale.some(({ record }) => record.activeWrites?.length || record.finalWrite) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (expired.length) {
    try {
      await cleanupExpiredPendingUploads(userId, expired.map((value) => value.record));
      const settled = expired.filter(({ record }) => !record.activeWrites?.length && !record.finalWrite);
      if (settled.length) await prisma.verificationToken.deleteMany({ where: { identifier, token: { in: settled.map((value) => value.token) }, expires: { lte: now } } });
    } catch {
      // Preserve cleanup work, including unresolved PUTs, for reconciliation.
    }
  }
  if (budgetExceeded) throw new ExperienceEvidenceUploadError(unresolvedExpired
    ? "Hay cargas pendientes de revisión. Contacta con soporte para recuperar su espacio temporal."
    : "Tienes demasiadas evidencias pendientes. Termina o espera a que venzan las cargas anteriores.", 429);
}

async function refreshPendingUploadBudget(userId: string, record: PendingUploadBudget, expires: Date) {
  const identifier = pendingBudgetIdentifier(userId);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${identifier}))`);
    const rows = await tx.verificationToken.findMany({ where: { identifier, expires: { gt: new Date() } }, select: { token: true } });
    const previous = rows.find((row) => decodePendingBudget(row.token)?.uploadId === record.uploadId);
    if (!previous) throw new ExperienceEvidenceUploadError("La reserva temporal de esta carga venció.", 409);
    const decoded = decodePendingBudget(previous.token);
    if (!decoded || decoded.activeWrites?.length || decoded.finalWrite) throw new ExperienceEvidenceUploadError("Hay fragmentos de esta evidencia todavía en escritura. Reintenta en unos segundos.", 409);
    await tx.verificationToken.delete({ where: { token: previous.token } });
    await tx.verificationToken.create({ data: { identifier, token: encodePendingBudget(record), expires } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function chunkKey(claim: UploadClaim, index: number) {
  return `${EXPERIENCE_EVIDENCE_PREFIX}/pending/${userPrefix(claim.sub)}/${claim.uploadId}/chunks/${index}`;
}

function finalKey(claim: UploadClaim, fileName: string) {
  const safe = sanitizeFileName(fileName) || "evidencia.bin";
  return `${EXPERIENCE_EVIDENCE_PREFIX}/pending/${userPrefix(claim.sub)}/${claim.uploadId}-${safe}`;
}

function assertUploadClaim(claim: UploadClaim, userId: string) {
  if (claim.sub !== userId || !/^[a-f0-9-]{36}$/.test(claim.uploadId)) throw new ExperienceEvidenceUploadError("La carga no pertenece a esta sesión.", 403);
  if (!normalizeFileName(claim.fileName) || !ALLOWED_EXPERIENCE_EVIDENCE_TYPES.has(claim.contentType)) throw new ExperienceEvidenceUploadError("El archivo no está permitido.");
  if (!Number.isSafeInteger(claim.size) || claim.size < 1 || claim.size > MAX_EXPERIENCE_EVIDENCE_SIZE) throw new ExperienceEvidenceUploadError("Cada evidencia debe pesar como máximo 8 MB.");
  if (claim.chunks !== Math.ceil(claim.size / EXPERIENCE_EVIDENCE_CHUNK_SIZE)) throw new ExperienceEvidenceUploadError("El manifiesto de carga no es válido.");
}

type UploadBudgetDependencies = {
  reserve: typeof reservePendingUploadBudget;
  refresh: typeof refreshPendingUploadBudget;
  finishFinal: (userId: string, uploadId: string, nonce: string) => Promise<boolean>;
  store: ReturnType<typeof getWorklogEvidenceUploadStore>;
};

async function pendingUploadIsActive(client: Pick<Prisma.TransactionClient, "verificationToken">, userId: string, uploadId: string) {
  const rows = await client.verificationToken.findMany({
    where: { identifier: pendingBudgetIdentifier(userId), expires: { gt: new Date() } },
    select: { token: true },
  });
  return rows.some((row) => {
    const record = decodePendingBudget(row.token);
    return record?.uploadId === uploadId && !record.storageKey;
  });
}

async function assertPendingUploadReservation(userId: string, uploadId: string) {
  if (!await pendingUploadIsActive(prisma, userId, uploadId))
    throw new ExperienceEvidenceUploadError("La reserva temporal de esta carga ya fue consumida o venció.", 409);
}

async function beginPendingUploadWrite(userId: string, uploadId: string, index: number, nonce: string) {
  const identifier = pendingBudgetIdentifier(userId);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${identifier}))`);
    const rows = await tx.verificationToken.findMany({ where: { identifier, expires: { gt: new Date() } }, select: { token: true, expires: true } });
    const previous = rows.find((row) => decodePendingBudget(row.token)?.uploadId === uploadId);
    if (!previous) throw new ExperienceEvidenceUploadError("La reserva temporal de esta carga ya fue consumida o venció.", 409);
    const record = decodePendingBudget(previous.token);
    if (!record || record.storageKey) throw new ExperienceEvidenceUploadError("La carga ya fue finalizada o requiere revisión.", 409);
    if (record.activeWrites?.some((write) => write.index === index)) throw new ExperienceEvidenceUploadError("Este fragmento ya se está escribiendo.", 409);
    await tx.verificationToken.delete({ where: { token: previous.token } });
    await tx.verificationToken.create({
      data: {
        identifier,
        token: encodePendingBudget({ ...record, activeWrites: [...(record.activeWrites || []), { index, nonce }] }),
        expires: previous.expires,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
}

async function finishPendingUploadWrite(userId: string, uploadId: string, index: number | "final", nonce: string) {
  const identifier = pendingBudgetIdentifier(userId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${identifier}))`);
    const rows = await tx.verificationToken.findMany({ where: { identifier }, select: { token: true, expires: true } });
    const previous = rows.find((row) => decodePendingBudget(row.token)?.uploadId === uploadId);
    if (!previous) return false;
    const record = decodePendingBudget(previous.token);
    if (!record) return false;
    const activeWrites = record.activeWrites || [];
    const markerNonce = index === "final" ? record.finalWrite : activeWrites.find((write) => write.index === index)?.nonce;
    if (!markerNonce) return previous.expires > new Date();
    if (markerNonce !== nonce) throw new ExperienceEvidenceUploadError("La escritura del fragmento perdió su reserva exclusiva.", 409);
    const remaining = activeWrites.filter((write) => write.nonce !== nonce);
    await tx.verificationToken.delete({ where: { token: previous.token } });
    await tx.verificationToken.create({
      data: {
        identifier,
        token: encodePendingBudget({ ...record, activeWrites: remaining.length ? remaining : undefined, finalWrite: index === "final" ? undefined : record.finalWrite }),
        expires: previous.expires,
      },
    });
    return previous.expires > new Date();
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
}

type UploadChunkDependencies = {
  assertPending: typeof assertPendingUploadReservation;
  beginWrite: typeof beginPendingUploadWrite;
  finishWrite: (userId: string, uploadId: string, index: number, nonce: string) => Promise<boolean>;
  store: ReturnType<typeof getWorklogEvidenceUploadStore>;
};

function validateExperienceEvidenceChunkClaim(input: { userId: string; uploadId: string; index: number; token: string }) {
  const claim = open<UploadClaim>(input.token, "experience-evidence-upload");
  assertUploadClaim(claim, input.userId);
  if (claim.uploadId !== input.uploadId || !Number.isSafeInteger(input.index) || input.index < 0 || input.index >= claim.chunks)
    throw new ExperienceEvidenceUploadError("El fragmento no pertenece a esta carga.", 403);
  const expectedSize = input.index === claim.chunks - 1
    ? claim.size - input.index * EXPERIENCE_EVIDENCE_CHUNK_SIZE
    : EXPERIENCE_EVIDENCE_CHUNK_SIZE;
  return { claim, expectedSize };
}

export async function authorizeExperienceEvidenceChunk(
  input: { userId: string; uploadId: string; index: number; token: string },
  dependencies?: Partial<UploadChunkDependencies>,
) {
  const { expectedSize } = validateExperienceEvidenceChunkClaim(input);
  await (dependencies?.assertPending || assertPendingUploadReservation)(input.userId, input.uploadId);
  return { expectedSize };
}

export async function createExperienceEvidenceUpload(input: { userId: string; fileName: unknown; contentType: unknown; size: unknown }, dependencies?: Partial<UploadBudgetDependencies>) {
  const fileName = normalizeFileName(input.fileName);
  const contentType = typeof input.contentType === "string" ? input.contentType : "";
  const size = Number(input.size);
  if (!fileName || !ALLOWED_EXPERIENCE_EVIDENCE_TYPES.has(contentType)) throw new ExperienceEvidenceUploadError("Solo se admiten fotos JPG, PNG, WEBP, AVIF o documentos PDF.");
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_EXPERIENCE_EVIDENCE_SIZE) throw new ExperienceEvidenceUploadError("Cada evidencia debe pesar como máximo 8 MB.");
  const claim: UploadClaim = {
    v: 1,
    kind: "experience-evidence-upload",
    sub: input.userId,
    uploadId: randomUUID(),
    fileName,
    contentType,
    size,
    chunks: Math.ceil(size / EXPERIENCE_EVIDENCE_CHUNK_SIZE),
    exp: Math.floor(Date.now() / 1000) + EXPERIENCE_EVIDENCE_UPLOAD_TTL_SECONDS,
  };
  await (dependencies?.reserve || reservePendingUploadBudget)(input.userId, { v: 1, uploadId: claim.uploadId, size: claim.size, chunks: claim.chunks }, new Date(claim.exp * 1000));
  return { uploadId: claim.uploadId, chunkSize: EXPERIENCE_EVIDENCE_CHUNK_SIZE, chunks: claim.chunks, token: seal(claim) };
}

export async function storeExperienceEvidenceChunk(
  input: { userId: string; uploadId: string; index: number; token: string; bytes: ArrayBuffer },
  dependencies?: Partial<UploadChunkDependencies>,
) {
  const { claim, expectedSize } = validateExperienceEvidenceChunkClaim(input);
  if (input.bytes.byteLength !== expectedSize) throw new ExperienceEvidenceUploadError("El fragmento tiene un tamaño inesperado.", 422);
  const sha256 = createHash("sha256").update(Buffer.from(input.bytes)).digest("hex");
  const store = dependencies?.store || getWorklogEvidenceUploadStore();
  const key = chunkKey(claim, input.index);
  const nonce = randomUUID();
  const beginWrite = dependencies?.beginWrite || beginPendingUploadWrite;
  const finishWrite = dependencies?.finishWrite || finishPendingUploadWrite;
  await beginWrite(input.userId, input.uploadId, input.index, nonce);
  let writeFinished = false;
  let blobWriteConfirmed = false;
  try {
    const result = await store.set(key, input.bytes, { onlyIfNew: true, metadata: { kind: "experience-evidence-chunk", ownerId: input.userId, uploadId: claim.uploadId, index: input.index, size: input.bytes.byteLength, sha256, expiresAt: claim.exp } });
    blobWriteConfirmed = true;
    if (result.modified === false) {
      const existing = await store.getMetadata(key);
      if (existing?.metadata.sha256 !== sha256 || existing.metadata.size !== input.bytes.byteLength || existing.metadata.ownerId !== input.userId) throw new ExperienceEvidenceUploadError("El fragmento ya existe con otro contenido.", 409);
    }
    writeFinished = await finishWrite(input.userId, input.uploadId, input.index, nonce);
    if (!writeFinished) {
      await store.delete(key).catch(() => undefined);
      throw new ExperienceEvidenceUploadError("La reserva temporal de esta carga fue consumida durante la escritura.", 409);
    }
  } catch (error) {
    if (!writeFinished && blobWriteConfirmed) {
      try {
        const reservationStillActive = await finishWrite(input.userId, input.uploadId, input.index, nonce);
        if (!reservationStillActive) await store.delete(key).catch(() => undefined);
      } catch {
        // Retain the durable marker when PostgreSQL cannot confirm completion.
      }
    }
    // A transport rejection does not prove that the remote PUT was canceled.
    // Keep its marker through expiry so finalize/attach cannot race a
    // late object commit by treating an uncertain write as complete.
    throw error;
  }
  return { index: input.index, sha256 };
}

function verifyPdf(bytes: Buffer) {
  const header = bytes.subarray(0, 8).toString("ascii");
  const tail = bytes.subarray(Math.max(0, bytes.length - 2048)).toString("latin1");
  if (!header.startsWith("%PDF-") || !tail.includes("%%EOF")) throw new ExperienceEvidenceUploadError("El PDF está dañado o su contenido no coincide con el formato declarado.", 422);
}

export async function finalizeExperienceEvidenceUpload(input: { userId: string; token: string }, dependencies?: Partial<UploadBudgetDependencies>) {
  const claim = open<UploadClaim>(input.token, "experience-evidence-upload");
  assertUploadClaim(claim, input.userId);
  const store = dependencies?.store || getWorklogEvidenceUploadStore();
  const chunks: Buffer[] = [];
  for (let index = 0; index < claim.chunks; index += 1) {
    const entry = await store.getWithMetadata(chunkKey(claim, index), { type: "arrayBuffer" });
    if (!entry || entry.metadata.ownerId !== input.userId || entry.metadata.uploadId !== claim.uploadId || entry.metadata.index !== index) throw new ExperienceEvidenceUploadError("Faltan fragmentos para completar la evidencia.", 409);
    const bytes = Buffer.from(entry.data);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (entry.metadata.sha256 !== digest || entry.metadata.size !== bytes.length) throw new ExperienceEvidenceUploadError("Un fragmento no superó la verificación de integridad.", 422);
    chunks.push(bytes);
  }
  const source = Buffer.concat(chunks);
  if (source.length !== claim.size) throw new ExperienceEvidenceUploadError("La evidencia reconstruida tiene un tamaño inesperado.", 422);

  let bytes: Buffer<ArrayBufferLike> = source;
  let fileName = claim.fileName;
  let contentType = claim.contentType;
  if (contentType === "application/pdf") verifyPdf(source);
  else {
    try {
      // Load the native/WASM decoder only after authentication, ownership and
      // chunk integrity checks. This keeps init/chunk endpoints independent of
      // the image runtime and gives the finalization trace an explicit binary.
      const { sanitizeWorklogEvidenceImage } = await import("@/lib/server/worklog-media-security");
      const sanitized = await sanitizeWorklogEvidenceImage({ bytes: source, claimedContentType: contentType, fileName });
      bytes = sanitized.bytes;
      fileName = sanitized.fileName;
      contentType = sanitized.contentType;
    } catch (error) {
      if (error instanceof Error && error.name === "WorklogMediaSecurityError") throw new ExperienceEvidenceUploadError(error.message, 422);
      throw error;
    }
  }

  const storageKey = finalKey(claim, fileName);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const receiptExp = Math.floor(Date.now() / 1000) + RECEIPT_TTL_SECONDS;
  // Persist the exact final key in the expiring budget before writing bytes.
  // If the function stops after this point, the next upload can safely remove
  // an unreferenced orphan without guessing its sanitized file name.
  // Keep charging the original source size while its chunks exist. A highly
  // compressible image must not free temporary budget before those chunks are
  // attached and deleted.
  const finalWrite = randomUUID();
  await (dependencies?.refresh || refreshPendingUploadBudget)(input.userId, { v: 1, uploadId: claim.uploadId, size: claim.size, chunks: claim.chunks, storageKey, finalWrite }, new Date(receiptExp * 1000));
  const result = await store.set(storageKey, Uint8Array.from(bytes).buffer, {
    onlyIfNew: true,
    metadata: { kind: "experience-evidence-ready", ownerId: input.userId, uploadId: claim.uploadId, fileName, contentType, size: bytes.length, sha256, expiresAt: receiptExp },
  });
  if (result.modified === false) {
    const existing = await store.getMetadata(storageKey);
    if (existing?.metadata.ownerId !== input.userId || existing.metadata.uploadId !== claim.uploadId || existing.metadata.sha256 !== sha256) throw new ExperienceEvidenceUploadError("La evidencia final entra en conflicto con una carga anterior.", 409);
  }
  // A failed/ambiguous PUT retains finalWrite, just like a chunk write. Only a
  // confirmed write can clear it; an expired confirmation cannot issue a receipt.
  const finishFinal = dependencies?.finishFinal || ((userId: string, uploadId: string, nonce: string) => finishPendingUploadWrite(userId, uploadId, "final", nonce));
  if (!await finishFinal(input.userId, claim.uploadId, finalWrite)) {
    await store.delete(storageKey).catch(() => undefined);
    throw new ExperienceEvidenceUploadError("La reserva temporal venció durante la escritura de la evidencia.", 409);
  }
  const receipt: EvidenceReceipt = { v: 1, kind: "experience-evidence-receipt", sub: input.userId, uploadId: claim.uploadId, storageKey, fileName, contentType, size: bytes.length, chunks: claim.chunks, sha256, exp: receiptExp };
  return { receipt: seal(receipt), fileName, contentType, size: bytes.length };
}

async function resolveReceipts(tokens: string[], userId: string) {
  if (tokens.length > MAX_RECEIPTS) throw new ExperienceEvidenceUploadError(`Puedes adjuntar hasta ${MAX_RECEIPTS} archivos.`);
  const store = getWorklogEvidenceUploadStore();
  const receipts: EvidenceReceipt[] = [];
  for (const token of tokens) {
    const receipt = open<EvidenceReceipt>(token, "experience-evidence-receipt");
    if (receipt.sub !== userId || !Number.isSafeInteger(receipt.chunks) || receipt.chunks < 1 || receipt.chunks > 3 || !receipt.storageKey.startsWith(`${EXPERIENCE_EVIDENCE_PREFIX}/pending/${userPrefix(userId)}/`)) throw new ExperienceEvidenceUploadError("Una evidencia no pertenece a esta sesión.", 403);
    const metadata = await store.getMetadata(receipt.storageKey);
    if (!metadata || metadata.metadata.kind !== "experience-evidence-ready" || metadata.metadata.ownerId !== userId || metadata.metadata.uploadId !== receipt.uploadId || metadata.metadata.sha256 !== receipt.sha256 || metadata.metadata.size !== receipt.size) throw new ExperienceEvidenceUploadError("Una evidencia ya no está disponible o no superó la verificación.", 409);
    receipts.push(receipt);
  }
  if (new Set(receipts.map((item) => item.storageKey)).size !== receipts.length) throw new ExperienceEvidenceUploadError("La misma evidencia no puede adjuntarse dos veces.");
  return receipts;
}

export async function validateExperienceEvidenceReceipts(tokens: string[], userId: string, experienceId?: string) {
  const receipts = await resolveReceipts(tokens, userId);
  if (!experienceId || !receipts.length) return;
  const [experience, count, existing] = await Promise.all([
    prisma.terraqoProfessionalExperience.findFirst({ where: { id: experienceId, professionalProfile: { userId } }, select: { id: true } }),
    prisma.terraqoExperienceEvidence.count({ where: { experienceId } }),
    prisma.terraqoExperienceEvidence.findMany({ where: { storageKey: { in: receipts.map((item) => item.storageKey) } }, select: { experienceId: true, storageKey: true, uploadedById: true } }),
  ]);
  if (!experience) throw new ExperienceEvidenceUploadError("No tienes permiso para adjuntar evidencia a esta experiencia.", 403);
  if (existing.some((item) => item.experienceId !== experienceId || item.uploadedById !== userId)) throw new ExperienceEvidenceUploadError("Una evidencia ya fue utilizada en otra experiencia.", 409);
  const existingKeys = new Set(existing.map((item) => item.storageKey));
  if (count + receipts.filter((item) => !existingKeys.has(item.storageKey)).length > MAX_RECEIPTS) throw new ExperienceEvidenceUploadError(`Cada experiencia admite hasta ${MAX_RECEIPTS} evidencias.`, 409);
}

export async function attachExperienceEvidenceReceipts(tokens: string[], experienceId: string, userId: string) {
  if (!tokens.length) return [];
  const receipts = await resolveReceipts(tokens, userId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let stage = "transaction-start";
    try {
      const attached = await prisma.$transaction(async (tx) => {
        stage = "profile-read";
        const profile = await tx.terraqoProfessionalProfile.findUnique({ where: { userId }, select: { id: true, planTier: true } });
        if (!profile) throw new ExperienceEvidenceUploadError("No tienes permiso para adjuntar evidencia a esta experiencia.", 403);
        stage = "profile-lock";
        await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile" WHERE id=${profile.id} AND "userId"=${userId} FOR UPDATE`);
        stage = "experience-lock";
        const owned = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalExperience" WHERE id=${experienceId} AND "professionalProfileId"=${profile.id} FOR UPDATE`);
        if (!owned.length) throw new ExperienceEvidenceUploadError("No tienes permiso para adjuntar evidencia a esta experiencia.", 403);
        stage = "existing-evidence-read";
        const existing = await tx.terraqoExperienceEvidence.findMany({ where: { storageKey: { in: receipts.map((item) => item.storageKey) } }, select: { experienceId: true, storageKey: true, uploadedById: true } });
        if (existing.some((item) => item.experienceId !== experienceId || item.uploadedById !== userId)) throw new ExperienceEvidenceUploadError("Una evidencia ya fue utilizada en otra experiencia.", 409);
        const existingKeys = new Set(existing.map((item) => item.storageKey));
        const pending = receipts.filter((item) => !existingKeys.has(item.storageKey));
        const count = await tx.terraqoExperienceEvidence.count({ where: { experienceId } });
        if (count + pending.length > MAX_RECEIPTS) throw new ExperienceEvidenceUploadError(`Cada experiencia admite hasta ${MAX_RECEIPTS} evidencias.`, 409);
        if (pending.length) {
          stage = "billing-read";
          const accounts = await tx.$queryRaw<{ planCode: string; paidThrough: Date | null }[]>(Prisma.sql`SELECT "planCode","paidThrough" FROM icc."TerraqoBillingAccount" WHERE "ownerKey"=${`user:${userId}`} AND mode='live' FOR SHARE`);
          const plan = accounts[0]
            ? getBillingPlan(accounts[0].paidThrough && accounts[0].paidThrough > new Date() ? accounts[0].planCode : "personal-free")
            : BILLING_PLANS.find((candidate) => candidate.audience === "PERSONAL" && candidate.tier === profile.planTier) || getBillingPlan("personal-free");
          if (plan.audience !== "PERSONAL") throw new ExperienceEvidenceUploadError("La capacidad personal requiere revisión.", 409);
          stage = "storage-floor";
          const floor = await personalRetainedStorageUnits(tx, userId);
          const charge = pending.reduce((sum, item) => sum + Math.ceil(item.size / 1_000_000), 0);
          const bucket = { ownerKey: `user:${userId}`, period: "retained", metric: "storage-mb" };
          stage = "usage-bucket";
          await tx.terraqoUsageBucket.createMany({ data: [{ ...bucket, used: floor }], skipDuplicates: true });
          await tx.terraqoUsageBucket.updateMany({ where: { ...bucket, used: { lt: floor } }, data: { used: floor } });
          const charged = await tx.terraqoUsageBucket.updateMany({ where: { ...bucket, used: { lte: plan.storageMb - charge } }, data: { used: { increment: charge } } });
          if (charged.count !== 1) throw new ExperienceEvidenceUploadError("La cuota personal de almacenamiento está completa.", 429);
          stage = "evidence-create";
          await tx.terraqoExperienceEvidence.createMany({ data: pending.map((item) => ({ experienceId, uploadedById: userId, storageKey: item.storageKey, fileName: item.fileName, contentType: item.contentType, size: item.size })), skipDuplicates: true });
        }
        stage = "pending-budget-lock";
        const identifier = pendingBudgetIdentifier(userId);
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${identifier}))`);
        const budgetRows = await tx.verificationToken.findMany({ where: { identifier }, select: { token: true } });
        const uploadIds = new Set(receipts.map((receipt) => receipt.uploadId));
        const matchingBudgets = budgetRows.flatMap((row) => {
          const record = decodePendingBudget(row.token);
          return record && uploadIds.has(record.uploadId) ? [{ row, record }] : [];
        });
        if (matchingBudgets.some(({ record }) => record.activeWrites?.length || record.finalWrite)) throw new ExperienceEvidenceUploadError("Una evidencia todavía tiene fragmentos en escritura. Reintenta en unos segundos.", 409);
        const consumed = matchingBudgets.map(({ row }) => row);
        if (consumed.length) await tx.verificationToken.deleteMany({ where: { token: { in: consumed.map((row) => row.token) } } });
        stage = "attached-read";
        return tx.terraqoExperienceEvidence.findMany({ where: { storageKey: { in: receipts.map((item) => item.storageKey) }, experienceId }, orderBy: { createdAt: "asc" } });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        // Supabase is remote and the retained-storage floor intentionally
        // aggregates every personal evidence source while holding the owner
        // lock. Prisma's 5 s interactive-transaction default can expire before
        // the final receipt read even though every statement succeeded.
        maxWait: 5_000,
        timeout: 20_000,
      });
      stage = "chunk-cleanup";
      const store = getWorklogEvidenceUploadStore();
      await Promise.all(receipts.flatMap((receipt) => Array.from({ length: receipt.chunks }, (_, index) => store.delete(`${EXPERIENCE_EVIDENCE_PREFIX}/pending/${userPrefix(userId)}/${receipt.uploadId}/chunks/${index}`).catch(() => undefined))));
      return attached;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      console.error("experience-evidence-attach-failed", {
        stage,
        attempt: attempt + 1,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
        status: error instanceof ExperienceEvidenceUploadError ? error.status : undefined,
      });
      throw error;
    }
  }
  throw new ExperienceEvidenceUploadError("No se pudo confirmar la evidencia por concurrencia.", 409);
}
