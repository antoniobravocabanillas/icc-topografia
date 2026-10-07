import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { personalRetainedStorageUnits } from "@/lib/terraqo/billing/personal-storage-usage";
import { EXPERIENCE_EVIDENCE_PREFIX, MAX_EXPERIENCE_EVIDENCE_SIZE, getWorklogEvidenceStore } from "./media";
import { cleanupRetrySchedule } from "./private-upload-retry";

type Marker={source?:unknown;storageCleanupState?:unknown;storageCleanupKey?:unknown;storageCleanupBytes?:unknown;storageCleanupExperienceId?:unknown;storageCleanupAttempts?:unknown};
const marker=(value:unknown):Marker=>value && typeof value==="object" && !Array.isArray(value)?value as Marker:{};
export async function recoverExperienceEvidenceCleanup(id:string,store?:Pick<ReturnType<typeof getWorklogEvidenceStore>,"delete">){
  const audit=await prisma.activityLog.findFirst({where:{id,entityType:"ExperienceEvidence",action:"DELETED"},select:{id:true,actorId:true,metadata:true}});
  const pending=marker(audit?.metadata);
  if(!audit?.actorId || pending.source!=="native-portal" || pending.storageCleanupState!=="PENDING")return "skipped";
  const key=pending.storageCleanupKey,size=pending.storageCleanupBytes,experienceId=pending.storageCleanupExperienceId;
  if(typeof key!=="string" || typeof experienceId!=="string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(experienceId) ||
    !key.startsWith(`${EXPERIENCE_EVIDENCE_PREFIX}/${experienceId}/`) || key.includes("..") || key.includes("\\") ||
    !Number.isSafeInteger(size) || (size as number)<1 || (size as number)>MAX_EXPERIENCE_EVIDENCE_SIZE)return "blocked";
  try{
    const experience=await prisma.terraqoProfessionalExperience.findFirst({where:{id:experienceId,professionalProfile:{userId:audit.actorId}},select:{professionalProfileId:true}});
    if(!experience)return "blocked";
    return await prisma.$transaction(async tx=>{
      // The future upload must take these locks in the same order. Wait for an
      // uncertain upload commit before checking live references or removing a blob.
      const profile=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile" WHERE id=${experience.professionalProfileId} AND "userId"=${audit.actorId} FOR UPDATE`);
      if(!profile.length)return "blocked";
      const locked=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalExperience" WHERE id=${experienceId} AND "professionalProfileId"=${experience.professionalProfileId} FOR UPDATE`);
      if(!locked.length)return "blocked";
      const fence=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM icc."ActivityLog" WHERE id=${id} AND "actorId"=${audit.actorId} FOR UPDATE`);
      if(!fence.length)return "skipped";
      const row=await tx.activityLog.findUnique({where:{id},select:{metadata:true}});const current=marker(row?.metadata);
      if(current.source!=="native-portal" || current.storageCleanupState!=="PENDING" || current.storageCleanupKey!==key || current.storageCleanupBytes!==size || current.storageCleanupExperienceId!==experienceId)return "skipped";
      if(await tx.terraqoExperienceEvidence.count({where:{storageKey:key}}))return "blocked";
      await (store || getWorklogEvidenceStore()).delete(key);
      const floor=await personalRetainedStorageUnits(tx,audit.actorId!);const units=Math.ceil((size as number)/1_000_000);
      await tx.terraqoUsageBucket.updateMany({where:{ownerKey:`user:${audit.actorId}`,period:"retained",metric:"storage-mb",used:{gte:floor+units}},data:{used:{decrement:units}}});
      await tx.activityLog.update({where:{id},data:{metadata:{source:"native-portal",type:"EXPERIENCE_EVIDENCE",storageCleanupState:"COMPLETE"}}});
      return "completed";
    },{maxWait:5000,timeout:10000});
  }catch{
    try{await prisma.activityLog.updateMany({where:{id,metadata:{equals:audit.metadata as Prisma.InputJsonValue}},data:{metadata:{...(audit.metadata as Prisma.JsonObject),...cleanupRetrySchedule(pending.storageCleanupAttempts,new Date())}}});}catch{/* Preserve the durable PENDING marker during a database outage. */}
    return "retry";
  }
}
export async function compensateExperienceEvidenceUpload(userId:string,workspaceId:string,experienceId:string,file:{storageKey:string;size:number},store:Pick<ReturnType<typeof getWorklogEvidenceStore>,"delete">){
  // No deletion or quota release occurs if persistence fails. Recovery validates
  // ownership and live references, including after an uncertain SQL response.
  const audit=await prisma.activityLog.create({data:{actorId:userId,terraqoWorkspaceId:workspaceId,action:"DELETED",entityType:"ExperienceEvidence",entityId:file.storageKey,title:"Limpieza de evidencia pendiente",metadata:{source:"native-portal",type:"EXPERIENCE_EVIDENCE",storageCleanupState:"PENDING",storageCleanupExperienceId:experienceId,storageCleanupKey:file.storageKey,storageCleanupBytes:file.size}},select:{id:true}});
  return recoverExperienceEvidenceCleanup(audit.id,store);
}
