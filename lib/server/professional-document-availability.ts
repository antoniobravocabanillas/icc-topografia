import { Prisma } from "@prisma/client";

/** Hold through the protected read or derived write. Profile-first order matches
 * withdrawal/replacement; a completed withdrawal prevents subsequent access.
 * This is availability only: callers must also authorize the requesting actor.
 */
export async function lockAvailableProfessionalDocument(tx: Prisma.TransactionClient, profileId: string, documentId: string) {
  const owners = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile" WHERE id=${profileId} FOR UPDATE`);
  if (!owners.length) return false;
  const documents = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalDocument"
    WHERE id=${documentId} AND "professionalProfileId"=${profileId} AND "withdrawnAt" IS NULL FOR SHARE`);
  return documents.length === 1;
}
