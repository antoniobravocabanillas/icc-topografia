import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { BILLING_PLANS, getBillingPlan } from "@/lib/terraqo/billing/catalog";
import { personalRetainedStorageUnits } from "@/lib/terraqo/billing/personal-storage-usage";
import { DocumentLifecycleError, documentReplacementFingerprint, replaceProfessionalDocumentInTransaction } from "./professional-document-lifecycle";

type FileDescriptor = { fileName: string; contentType: string; size: number; contentSha256: string };
type Attempt = FileDescriptor & { id: string; documentId: string; professionalProfileId: string; actorId: string;
  operationKey: string; expectedVersion: number; fingerprint: string; storageKey: string; reservedUnits: number;
  state: "RESERVED" | "COMMITTED" | "CLEANUP_PENDING" | "CLEANED"; resultDocumentId: string | null;
  cleanupAttempts: number; nextAttemptAt: Date | null };
const conflict = () => new DocumentLifecycleError("El documento o el intento cambiaron. Actualiza el expediente.", 409);

/** Internal only: bounded bytes/signature/hash are validated before this call.
 * SQL reservation and durable attempt must commit atomically. No client quota input.
 */
export async function reserveDocumentReplacementInTransaction(tx: Prisma.TransactionClient,
  input: { actorId: string; documentId: string; operationKey: string; expectedVersion: number; file: FileDescriptor }) {
  const file = input.file;
  if (!input.actorId || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.documentId) || !/^[a-zA-Z0-9_-]{16,128}$/.test(input.operationKey) ||
    !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion >= 2147483647 ||
    !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 10485760 || !/^[a-f0-9]{64}$/.test(file.contentSha256) ||
    !file.fileName.trim() || file.fileName.length > 255 || /[\r\n\u0000]/.test(file.fileName)) throw new DocumentLifecycleError("Carga inválida.", 422);
  const profiles = await tx.$queryRaw<{ id: string; planTier: string }[]>(Prisma.sql`SELECT id,"planTier" FROM icc."TerraqoProfessionalProfile" WHERE "userId"=${input.actorId} FOR UPDATE`);
  const profile = profiles[0]; if (!profile) throw new DocumentLifecycleError("Documento no disponible.", 404);
  const docs = await tx.$queryRaw<{ type: string; workspaceId: string | null; withdrawnAt: Date | null; lifecycleVersion: number }[]>(Prisma.sql`
    SELECT type::text,"workspaceId","withdrawnAt","lifecycleVersion" FROM icc."TerraqoProfessionalDocument"
    WHERE id=${input.documentId} AND "professionalProfileId"=${profile.id} FOR UPDATE`);
  const doc = docs[0]; if (!doc) throw new DocumentLifecycleError("Documento no disponible.", 404);
  if (["DNI_FRONT", "DNI_BACK"].includes(doc.type)) throw conflict();
  const mimeTypes = doc.type === "CV" ? ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] : ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!mimeTypes.includes(file.contentType)) throw new DocumentLifecycleError("Formato no permitido.", 422);
  if (doc.workspaceId) {
    const members = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspaceMember" WHERE "workspaceId"=${doc.workspaceId} AND "userId"=${input.actorId} AND active=true AND role='PROFESSIONAL' FOR SHARE`);
    if (!members.length) throw new DocumentLifecycleError("Documento no disponible.", 404);
  }
  const fingerprint = documentReplacementFingerprint(input.documentId, input.expectedVersion, file);
  const receipts = await tx.$queryRaw<{ id: string; replacementFingerprint: string }[]>(Prisma.sql`SELECT id,"replacementFingerprint" FROM icc."TerraqoProfessionalDocument"
    WHERE "professionalProfileId"=${profile.id} AND "replacementOperationKey"=${input.operationKey}`);
  if (receipts[0]) {
    if (receipts[0].replacementFingerprint !== fingerprint) throw conflict();
    return { kind: "receipt" as const, id: receipts[0].id };
  }
  if (doc.withdrawnAt || doc.lifecycleVersion !== input.expectedVersion) throw conflict();
  if ((await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalDocument" WHERE "replacesDocumentId"=${input.documentId}`)).length) throw conflict();
  const billing = await tx.$queryRaw<{ planCode: string; paidThrough: Date | null }[]>(Prisma.sql`SELECT "planCode","paidThrough" FROM icc."TerraqoBillingAccount" WHERE "ownerKey"=${`user:${input.actorId}`} AND mode='live' FOR SHARE`);
  const now = new Date();
  const plan = billing[0] ? getBillingPlan(billing[0].paidThrough && billing[0].paidThrough > now ? billing[0].planCode : "personal-free")
    : BILLING_PLANS.find(p => p.audience === "PERSONAL" && p.tier === profile.planTier) ?? getBillingPlan("personal-free");
  if (plan.audience !== "PERSONAL") throw conflict();
  const floor = await documentReplacementStorageFloor(tx, input.actorId, profile.id);
  if (!Number.isSafeInteger(floor) || floor < 0) throw conflict();
  const units = Math.ceil(file.size / 1000000), ownerKey = `user:${input.actorId}`;
  await tx.$executeRaw(Prisma.sql`INSERT INTO icc."TerraqoUsageBucket" (id,"ownerKey",period,metric,used)
    VALUES (${randomUUID()},${ownerKey},'retained','storage-mb',${floor}) ON CONFLICT ("ownerKey",period,metric) DO UPDATE SET used=GREATEST(icc."TerraqoUsageBucket".used,EXCLUDED.used)`);
  const charged = await tx.$executeRaw(Prisma.sql`UPDATE icc."TerraqoUsageBucket" SET used=used+${units} WHERE "ownerKey"=${ownerKey} AND period='retained' AND metric='storage-mb' AND used<=${plan.storageMb-units}`);
  if (charged !== 1) throw new DocumentLifecycleError("No hay capacidad disponible para otra versión.", 409);
  if (billing[0]?.paidThrough && billing[0].paidThrough > now && billing[0].paidThrough <= new Date()) throw conflict();
  const id = randomUUID(), storageKey = `professional-documents/${profile.id}/${doc.type.toLowerCase()}/${randomUUID()}`;
  const rows = await tx.$queryRaw<Attempt[]>(Prisma.sql`INSERT INTO icc."TerraqoDocumentReplacementAttempt"
    (id,"professionalProfileId","documentId","actorId","operationKey",fingerprint,"expectedVersion","storageKey","fileName","contentType","contentSha256",size,"reservedUnits")
    VALUES (${id},${profile.id},${input.documentId},${input.actorId},${input.operationKey},${fingerprint},${input.expectedVersion},${storageKey},${file.fileName},${file.contentType},${file.contentSha256},${file.size},${units}) RETURNING *`);
  return { kind: "reserved" as const, attempt: rows[0] };
}

export async function documentReplacementStorageFloor(tx: Prisma.TransactionClient, actorId: string, profileId: string) {
  const pending = await tx.$queryRaw<{ units: bigint }[]>(Prisma.sql`SELECT COALESCE(sum("reservedUnits"),0)::bigint AS units FROM icc."TerraqoDocumentReplacementAttempt" WHERE "professionalProfileId"=${profileId} AND state IN ('RESERVED','CLEANUP_PENDING')`);
  const floor = await personalRetainedStorageUnits(tx, actorId) + Number(pending[0].units);
  if (!Number.isSafeInteger(floor) || floor < 0) throw conflict();
  return floor;
}

export async function lockDocumentReplacementAttempt(tx: Prisma.TransactionClient, actorId: string, id: string) {
  const profiles = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile" WHERE "userId"=${actorId} FOR UPDATE`);
  if (!profiles[0]) throw new DocumentLifecycleError("Intento no disponible.", 404);
  const attempts = await tx.$queryRaw<Attempt[]>(Prisma.sql`SELECT * FROM icc."TerraqoDocumentReplacementAttempt" WHERE id=${id} AND "professionalProfileId"=${profiles[0].id} AND "actorId"=${actorId} FOR UPDATE`);
  if (!attempts[0]) throw new DocumentLifecycleError("Intento no disponible.", 404);
  return attempts[0];
}

/** Invoke only after the store confirms this attempt's bytes. No store I/O here. */
export async function commitDocumentReplacementInTransaction(tx: Prisma.TransactionClient, actorId: string, id: string) {
  const row = await lockDocumentReplacementAttempt(tx, actorId, id);
  if (row.state !== "RESERVED" && row.state !== "COMMITTED") throw conflict();
  const result = await replaceProfessionalDocumentInTransaction(tx, { actorId, documentId: row.documentId,
    operationKey: row.operationKey, expectedVersion: row.expectedVersion, file: row });
  if (row.state === "COMMITTED") {
    if (row.resultDocumentId !== result.id) throw conflict();
    return { ...result, cleanupAttemptId: null };
  }
  const state = result.replayed ? "CLEANUP_PENDING" : "COMMITTED";
  await tx.$executeRaw(Prisma.sql`UPDATE icc."TerraqoDocumentReplacementAttempt" SET state=${state},
    "resultDocumentId"=${result.replayed ? null : result.id},"reservedUnits"=${result.replayed ? row.reservedUnits : 0} WHERE id=${row.id}`);
  return { ...result, cleanupAttemptId: result.replayed ? row.id : null };
}

/** Commit this fence before deleting anything. On an uncertain commit, the exact
 * live reference wins. A pending attempt cannot subsequently be finalized.
 */
export async function fenceDocumentReplacementCleanupInTransaction(tx: Prisma.TransactionClient, actorId: string, id: string, now = new Date()) {
  const row = await lockDocumentReplacementAttempt(tx, actorId, id);
  const live = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalDocument" WHERE "storageKey"=${row.storageKey}`);
  if (live.length || row.state === "COMMITTED") return "retained" as const;
  if (row.state === "CLEANED" && row.nextAttemptAt && row.nextAttemptAt > now) return "cleaned" as const;
  if (row.state === "CLEANUP_PENDING") return "pending" as const;
  await tx.$executeRaw(Prisma.sql`UPDATE icc."TerraqoDocumentReplacementAttempt" SET state='CLEANUP_PENDING',"nextAttemptAt"=NULL WHERE id=${row.id}`);
  return "pending" as const;
}
