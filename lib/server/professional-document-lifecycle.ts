import { Prisma } from "@prisma/client";

export class DocumentLifecycleError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 422) { super(message); }
}

type Withdrawal = { id: string; lifecycleVersion: number; withdrawnAt: Date; replayed: boolean };
type DocumentState = { id: string; type: string; lifecycleVersion: number; withdrawnAt: Date | null;
  withdrawnByUserId: string | null; withdrawOperationKey: string | null };

/** Not wired to routes until all readers/workers enforce withdrawal and the additive DDL is deployed.
 * Caller must supply one interactive transaction; actor comes from authenticated server context.
 * Profile-first lock order matches upload/deletion. Blob retention means no quota refund here.
 */
export async function withdrawProfessionalDocumentInTransaction(
  tx: Prisma.TransactionClient,
  input: { actorId: string; documentId: string; expectedVersion: number; operationKey: string },
): Promise<Withdrawal> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.documentId) || !input.actorId ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion >= 2147483647 ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(input.operationKey)) {
    throw new DocumentLifecycleError("Actualiza el documento antes de retirarlo.", 422);
  }
  const profiles = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM icc."TerraqoProfessionalProfile" WHERE "userId"=${input.actorId} FOR UPDATE`);
  if (!profiles[0]) throw new DocumentLifecycleError("Documento no disponible.", 404);
  const rows = await tx.$queryRaw<DocumentState[]>(Prisma.sql`
    SELECT id,type::text,"lifecycleVersion","withdrawnAt","withdrawnByUserId","withdrawOperationKey"
    FROM icc."TerraqoProfessionalDocument" WHERE id=${input.documentId}
      AND "professionalProfileId"=${profiles[0].id} FOR UPDATE`);
  const document = rows[0];
  if (!document) throw new DocumentLifecycleError("Documento no disponible.", 404);
  if (document.withdrawnAt) {
    if (document.withdrawnByUserId === input.actorId && document.withdrawOperationKey === input.operationKey &&
        document.lifecycleVersion === input.expectedVersion + 1) {
      return { id: document.id, lifecycleVersion: document.lifecycleVersion, withdrawnAt: document.withdrawnAt, replayed: true };
    }
    throw new DocumentLifecycleError("El documento cambió. Actualiza el expediente.", 409);
  }
  if (document.lifecycleVersion !== input.expectedVersion) throw new DocumentLifecycleError("El documento cambió. Actualiza el expediente.", 409);
  if (["DNI_FRONT", "DNI_BACK"].includes(document.type)) throw new DocumentLifecycleError("El retiro de identidad requiere una revisión específica.", 409);

  // These immutable fields are the withdrawal audit itself: same transaction,
  // exact actor/key/time/version. Review history and retained file remain intact.
  const changed = await tx.$queryRaw<Array<{ id: string; lifecycleVersion: number; withdrawnAt: Date }>>(Prisma.sql`
    UPDATE icc."TerraqoProfessionalDocument" SET "withdrawnAt"=clock_timestamp(),
      "withdrawnByUserId"=${input.actorId},"withdrawOperationKey"=${input.operationKey},"lifecycleVersion"="lifecycleVersion"+1
    WHERE id=${document.id} AND "professionalProfileId"=${profiles[0].id}
      AND "lifecycleVersion"=${input.expectedVersion} AND "withdrawnAt" IS NULL
    RETURNING id,"lifecycleVersion","withdrawnAt"`);
  if (changed.length !== 1) throw new DocumentLifecycleError("El documento cambió. Actualiza el expediente.", 409);
  await tx.$executeRaw(Prisma.sql`UPDATE icc."TerraqoProfessionalProfile" SET "cvUrl"=NULL
    WHERE id=${profiles[0].id} AND "cvUrl"=${`/api/terraqo/professional-documents/${document.id}`}`);
  return { ...changed[0], replayed: false };
}
