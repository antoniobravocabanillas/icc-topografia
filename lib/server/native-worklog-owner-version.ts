import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";

/** Caller already holds this owner's profile lock. A row lock alone does not refresh
 * a pre-existing Serializable snapshot; this version write makes stale waiters abort.
 */
export async function advanceNativeWorklogOwnerVersion(tx: Prisma.TransactionClient,
  profileId: string, actorId: string, createdAt: Date) {
  const affected = await tx.$executeRaw(Prisma.sql`UPDATE icc."TerraqoProfessionalProfile"
    SET "updatedAt"=GREATEST("updatedAt" + interval '1 millisecond', ${createdAt})
    WHERE id=${profileId} AND "userId"=${actorId}`);
  if (affected !== 1) throw new NativeWorklogOperationError(503);
}
