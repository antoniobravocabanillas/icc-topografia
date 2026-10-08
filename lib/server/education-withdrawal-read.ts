import "server-only";
import type { PrismaClient, TerraqoEducationEvidenceWithdrawal } from "@prisma/client";
import { EducationEvidenceReservationError, lockEducationEvidenceAccess } from "./education-evidence-reservation";
import type { WorkspacePortalToken } from "./workspace-portal-session";

export function educationWithdrawalReceipt(receipt: TerraqoEducationEvidenceWithdrawal) {
  return { operationKey: receipt.operationKey, evidenceId: receipt.targetEvidenceId,
    originalVersion: receipt.originalVersion.toISOString(), resultVersion: receipt.resultVersion.toISOString(),
    createdAt: receipt.createdAt.toISOString(), outcome: "WITHDRAWN" as const };
}

/** History proves logical withdrawal, not physical settlement or current state.
 * Null is an observation and never permission to issue another POST. */
export function readEducationWithdrawal(database: Pick<PrismaClient, "$transaction">, token: WorkspacePortalToken,
  educationId: string, operationKey: string) {
  if (!/^[a-f0-9]{32}$/.test(operationKey)) throw new EducationEvidenceReservationError("Clave no válida.", 422);
  return database.$transaction(async tx => {
    const access = await lockEducationEvidenceAccess(tx, token, educationId);
    const receipt = await tx.terraqoEducationEvidenceWithdrawal.findUnique({ where: {
      educationId_operationKey: { educationId, operationKey } } });
    if (receipt && receipt.actorId !== token.sub) throw new EducationEvidenceReservationError("Operación no disponible.", 404);
    if (access.grantExpires <= new Date() || token.exp <= Math.floor(Date.now() / 1000)) throw new EducationEvidenceReservationError("La sesión venció.", 401);
    if (access.capacityExpirations.some(value => value <= new Date())) throw new EducationEvidenceReservationError("El acceso cambió.", 409);
    return { current: { educationId, version: access.education.updatedAt.toISOString(), verificationStatus: access.education.verificationStatus },
      receipt: receipt ? educationWithdrawalReceipt(receipt) : null };
  }, { maxWait: 5000, timeout: 15000 });
}
