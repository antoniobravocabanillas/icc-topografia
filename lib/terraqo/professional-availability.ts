import type { Prisma, TerraqoProfessionalProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Declaration = Pick<TerraqoProfessionalProfile, "id" | "status" | "updatedAt" | "username" | "liveCvEnabled">;
// This namespace is distinct from clients' 32-hex publication operation keys.
const key = "availability-declaration";

export async function recordAvailabilityDeclaration(tx: Prisma.TransactionClient, profile: Declaration) {
  const data = {
    action: "DECLARE_AVAILABILITY", fingerprint: profile.status, resultVersion: profile.updatedAt,
    published: profile.liveCvEnabled, username: profile.username,
  };
  await tx.terraqoCvPublicationOperation.upsert({
    where: { professionalProfileId_operationKey: { professionalProfileId: profile.id, operationKey: key } },
    create: { id: `availability:${profile.id}`, professionalProfileId: profile.id, operationKey: key,
      originalVersion: profile.updatedAt, ...data },
    update: data,
  });
}

export async function declaredAvailabilityDate(profile: Pick<Declaration, "id" | "status">) {
  const row = await prisma.terraqoCvPublicationOperation.findUnique({
    where: { professionalProfileId_operationKey: { professionalProfileId: profile.id, operationKey: key } },
    select: { action: true, fingerprint: true, resultVersion: true },
  });
  return row?.action === "DECLARE_AVAILABILITY" && row.fingerprint === profile.status ? row.resultVersion : null;
}
