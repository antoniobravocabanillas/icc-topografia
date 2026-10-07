import "server-only";
import type { Prisma } from "@prisma/client";

type StorageDatabase = Pick<Prisma.TransactionClient,
  "terraqoProfessionalDocument" | "terraqoWorklogMedia" | "terraqoMessageAttachment" | "terraqoExperienceEvidence" |
  "terraqoEducationEvidence" | "terraqoEducationEvidenceAttempt">;

// Reservation baselines and cleanup floors must use the same ownership rules.
// Evidence belongs to its experience/education profile owner, never an
// arbitrary uploadedById value. Education tables are applied prerequisites.
export async function personalRetainedStorageBytes(db:StorageDatabase, userId:string) {
  if(!userId)throw new Error("Storage owner is required.");
  const aggregates=await Promise.all([
    db.terraqoProfessionalDocument.aggregate({where:{professionalProfile:{userId}},_sum:{size:true}}),
    db.terraqoWorklogMedia.aggregate({where:{worklog:{authorId:userId}},_sum:{size:true}}),
    db.terraqoMessageAttachment.aggregate({where:{message:{senderId:userId}},_sum:{size:true}}),
    db.terraqoExperienceEvidence.aggregate({where:{experience:{professionalProfile:{userId}}},_sum:{size:true}}),
    db.terraqoEducationEvidence.aggregate({where:{education:{professionalProfile:{userId}}},_sum:{size:true}}),
  ]);
  let total=0;
  for(const aggregate of aggregates){const size=aggregate._sum.size ?? 0;
    if(!Number.isSafeInteger(size) || size<0 || !Number.isSafeInteger(total+size))throw new Error("Retained storage total is invalid.");
    total+=size;
  }
  return total;
}
export async function personalRetainedStorageUnits(db:StorageDatabase,userId:string){
  const [bytes,attempts]=await Promise.all([
    personalRetainedStorageBytes(db,userId),
    db.terraqoEducationEvidenceAttempt.aggregate({where:{education:{professionalProfile:{userId}},
      state:{in:["RESERVED","CLEANUP_PENDING","QUARANTINED"]}},_sum:{reservedUnits:true}}),
  ]);
  // Reservations are already rounded units, never retained bytes. COMMITTED
  // is counted by its evidence row; zero-unit tombstones add no charge.
  const reserved=attempts._sum.reservedUnits ?? 0;
  const floor=Math.ceil(bytes/1_000_000)+reserved;
  if(!Number.isSafeInteger(reserved)||reserved<0||!Number.isSafeInteger(floor))throw new Error("Storage reserve total is invalid.");
  return floor;
}
