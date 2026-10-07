import "server-only";
import type { Prisma } from "@prisma/client";

type StorageDatabase = Pick<Prisma.TransactionClient,
  "terraqoProfessionalDocument" | "terraqoWorklogMedia" | "terraqoMessageAttachment" | "terraqoExperienceEvidence">;

// Reservation baselines and cleanup floors must use the same ownership rules.
// Evidence belongs to the experience owner, not an arbitrary uploadedById value.
export async function personalRetainedStorageBytes(db:StorageDatabase, userId:string) {
  if(!userId)throw new Error("Storage owner is required.");
  const aggregates=await Promise.all([
    db.terraqoProfessionalDocument.aggregate({where:{professionalProfile:{userId}},_sum:{size:true}}),
    db.terraqoWorklogMedia.aggregate({where:{worklog:{authorId:userId}},_sum:{size:true}}),
    db.terraqoMessageAttachment.aggregate({where:{message:{senderId:userId}},_sum:{size:true}}),
    db.terraqoExperienceEvidence.aggregate({where:{experience:{professionalProfile:{userId}}},_sum:{size:true}}),
  ]);
  let total=0;
  for(const aggregate of aggregates){const size=aggregate._sum.size ?? 0;
    if(!Number.isSafeInteger(size) || size<0 || !Number.isSafeInteger(total+size))throw new Error("Retained storage total is invalid.");
    total+=size;
  }
  return total;
}
export async function personalRetainedStorageUnits(db:StorageDatabase,userId:string){return Math.ceil(await personalRetainedStorageBytes(db,userId)/1_000_000);}
