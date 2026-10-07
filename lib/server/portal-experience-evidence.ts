import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefaultModulesForTier } from "@/lib/workspace";
import { getBillingPlan } from "@/lib/terraqo/billing/catalog";
import { reserveStorage } from "@/lib/terraqo/billing/storage-quota";
import { createExperienceEvidenceKey, getWorklogEvidenceStore } from "./media";
import { compensateExperienceEvidenceUpload } from "./experience-evidence-cleanup";
import { parseNativeExperienceEvidence } from "./native-experience-evidence-payload";
import type { WorkspacePortalToken } from "./workspace-portal-session";

export class PortalExperienceEvidenceError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const selected = { id:true, fileName:true, contentType:true, size:true, createdAt:true } as const;
const experienceSelect = {id:true,professionalProfileId:true,updatedAt:true,verificationStatus:true,verifiedByTerraqo:true,workspaceId:true,projectId:true} as const;
type Experience = Prisma.TerraqoProfessionalExperienceGetPayload<{select:typeof experienceSelect}>;
type Evidence = Prisma.TerraqoExperienceEvidenceGetPayload<{select:typeof selected}>;
const record = (row:Evidence) => ({id:row.id,name:row.fileName,contentType:row.contentType,size:row.size,createdAt:row.createdAt.toISOString()});
const editable = (row:Experience) => ["NOT_REQUESTED","REJECTED"].includes(row.verificationStatus) && !row.verifiedByTerraqo && !row.workspaceId && !row.projectId;
const operationId = (token:WorkspacePortalToken,experienceId:string,key:string) => createHash("sha256").update(JSON.stringify([token.sub,experienceId,key,"experience-evidence-v1"])).digest("hex").slice(0,32);

export async function lockExperienceEvidenceAccess(tx:Prisma.TransactionClient, token:WorkspacePortalToken, experienceId:string) {
  if(token.role!=="PROFESSIONAL" || token.exp<=Math.floor(Date.now()/1000))throw new PortalExperienceEvidenceError("Tu sesión profesional ya no está disponible.",403);
  const profile=await tx.terraqoProfessionalProfile.findUnique({where:{userId:token.sub},select:{id:true}});
  if(!profile)throw new PortalExperienceEvidenceError("Experiencia no disponible.",404);
  // Match the recovery lock order. Serialize version, operation and six-file
  // count across workspaces; immutable blob keys can never overwrite a replay.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile" WHERE id=${profile.id} AND "userId"=${token.sub} FOR UPDATE`);
  const rows=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalExperience" WHERE id=${experienceId} AND "professionalProfileId"=${profile.id} FOR UPDATE`);
  if(!rows.length)throw new PortalExperienceEvidenceError("Experiencia no disponible.",404);
  const workspace=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspace" WHERE id=${token.workspaceId} AND slug=${token.workspaceSlug} AND active=true AND "deletedAt" IS NULL FOR SHARE`);
  const member=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspaceMember" WHERE "workspaceId"=${token.workspaceId} AND "userId"=${token.sub} AND active=true AND role='PROFESSIONAL' FOR SHARE`);
  if(!workspace.length || !member.length)throw new PortalExperienceEvidenceError("Tu acceso profesional cambió.",403);
  const modules=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM icc."TerraqoWorkspaceModule" WHERE "workspaceId"=${token.workspaceId} AND code='PROFESSIONAL_NETWORK' AND active=true FOR SHARE`);
  const billing=await tx.$queryRaw<{planCode:string;paidThrough:Date|null}[]>(Prisma.sql`SELECT "planCode","paidThrough" FROM icc."TerraqoBillingAccount" WHERE "ownerKey"=${`workspace:${token.workspaceId}`} AND mode='live' FOR SHARE`);
  if(!modules.length || (billing[0] && !getDefaultModulesForTier(billing[0].paidThrough && billing[0].paidThrough>new Date()?getBillingPlan(billing[0].planCode).tier:"FREE").includes("PROFESSIONAL_NETWORK")))throw new PortalExperienceEvidenceError("El módulo profesional no está habilitado.",403);
  if(token.jti){
    const grants=await tx.$queryRaw<{token:string}[]>(Prisma.sql`SELECT token FROM icc."VerificationToken" WHERE identifier=${`portal-session:${token.workspaceId}:${token.sub}`} AND token=${createHash("sha256").update(token.jti).digest("hex")} AND expires>${new Date()} FOR SHARE`);
    if(!grants.length)throw new PortalExperienceEvidenceError("La sesión fue revocada.",401);
  }
  return tx.terraqoProfessionalExperience.findFirstOrThrow({where:{id:experienceId,professionalProfileId:profile.id},select:experienceSelect});
}
const transact = <T>(work:(tx:Prisma.TransactionClient)=>Promise<T>) => prisma.$transaction(work,{maxWait:5000,timeout:15000});
export async function listPortalExperienceEvidence(token:WorkspacePortalToken,experienceId:string,operationKey?:string){
  return transact(async tx=>{
    const experience=await lockExperienceEvidenceAccess(tx,token,experienceId);
    if(operationKey){const row=await tx.terraqoExperienceEvidence.findFirst({where:{id:operationId(token,experienceId,operationKey),experienceId},select:selected});return {schemaVersion:1,workspaceSlug:token.workspaceSlug,experienceId,version:experience.updatedAt.toISOString(),record:row?record(row):null};}
    const rows=await tx.terraqoExperienceEvidence.findMany({where:{experienceId},select:selected,orderBy:{createdAt:"asc"},take:7});
    return {schemaVersion:1,workspaceSlug:token.workspaceSlug,experienceId,version:experience.updatedAt.toISOString(),canUpload:editable(experience)&&rows.length<6,limit:6,records:rows.slice(0,6).map(record),requiresReview:rows.length>6};
  });
}
type Dependencies = {store:ReturnType<typeof getWorklogEvidenceStore>;reserve:typeof reserveStorage;compensate:typeof compensateExperienceEvidenceUpload};
export async function uploadPortalExperienceEvidence(request:Request,token:WorkspacePortalToken,experienceId:string,dependencies?:Partial<Dependencies>){
  // Authorize ownership before consuming an untrusted multipart body.
  await transact(tx=>lockExperienceEvidenceAccess(tx,token,experienceId));
  const payload=await parseNativeExperienceEvidence(request);
  const id=operationId(token,experienceId,payload.operationKey);
  const fingerprint=createHash("sha256").update(JSON.stringify([payload.sha256,payload.file.name,payload.file.type,payload.file.size,payload.version])).digest("hex");
  const check=async(tx:Prisma.TransactionClient)=>{
    const experience=await lockExperienceEvidenceAccess(tx,token,experienceId);
    const previous=await tx.terraqoExperienceEvidence.findFirst({where:{id,experienceId},select:{...selected,storageKey:true}});
    if(previous){
      const audit=await tx.activityLog.findFirst({where:{actorId:token.sub,entityType:"ExperienceEvidence",entityId:id,action:"CREATED"},select:{metadata:true}});
      const metadata=audit?.metadata as {fingerprint?:unknown}|null;
      if(metadata?.fingerprint!==fingerprint)throw new PortalExperienceEvidenceError("La operación ya fue utilizada con otros datos.",409);
      return {experience,previous};
    }
    if(!editable(experience))throw new PortalExperienceEvidenceError("La experiencia está verificada, en revisión o vinculada y requiere revisión específica.",403);
    if(experience.updatedAt.toISOString()!==payload.version)throw new PortalExperienceEvidenceError("La experiencia cambió. Recarga antes de adjuntar.",409);
    if(await tx.terraqoExperienceEvidence.count({where:{experienceId}})>=6)throw new PortalExperienceEvidenceError("La experiencia alcanzó el límite de seis archivos.",422);
    return {experience,previous:null};
  };
  const initial=await transact(check);
  const response=(experience:Experience,row:Evidence)=>({schemaVersion:1,workspaceSlug:token.workspaceSlug,experienceId,version:experience.updatedAt.toISOString(),record:record(row)});
  if(initial.previous)return response(initial.experience,initial.previous);
  const store=dependencies?.store??getWorklogEvidenceStore();
  const key=createExperienceEvidenceKey(experienceId,payload.file.name);
  let reserved=false;
  try{
    await (dependencies?.reserve??reserveStorage)(token.sub,payload.file.size);reserved=true;
    await store.set(key,await payload.file.arrayBuffer(),{metadata:{contentType:payload.file.type,size:payload.file.size}});
    const saved=await transact(async tx=>{
      const current=await check(tx);
      if(current.previous)return {experience:current.experience,row:current.previous,retained:false};
      const row=await tx.terraqoExperienceEvidence.create({data:{id,experienceId,uploadedById:token.sub,storageKey:key,fileName:payload.file.name,contentType:payload.file.type,size:payload.file.size},select:selected});
      const updatedAt=new Date(Math.max(Date.now(),current.experience.updatedAt.getTime()+1));
      const changed=await tx.terraqoProfessionalExperience.updateMany({where:{id:experienceId,professionalProfileId:current.experience.professionalProfileId,updatedAt:current.experience.updatedAt,verificationStatus:{in:["NOT_REQUESTED","REJECTED"]},verifiedByTerraqo:false,workspaceId:null,projectId:null},data:{updatedAt}});
      if(changed.count!==1)throw new PortalExperienceEvidenceError("La experiencia cambió. Recarga antes de adjuntar.",409);
      await tx.activityLog.create({data:{actorId:token.sub,terraqoWorkspaceId:token.workspaceId,action:"CREATED",entityType:"ExperienceEvidence",entityId:id,title:"Evidencia privada adjuntada",metadata:{source:"native-portal",fingerprint}}});
      return {experience:{...current.experience,updatedAt},row,retained:true};
    });
    if(!saved.retained){reserved=false;await (dependencies?.compensate??compensateExperienceEvidenceUpload)(token.sub,token.workspaceId,experienceId,{storageKey:key,size:payload.file.size},store);}
    return response(saved.experience,saved.row);
  }catch(error){
    // An uncertain SQL reply must not delete a committed reference. Durable
    // recovery waits for the same owner locks and checks the evidence table.
    if(reserved)await (dependencies?.compensate??compensateExperienceEvidenceUpload)(token.sub,token.workspaceId,experienceId,{storageKey:key,size:payload.file.size},store);
    throw error;
  }
}
export async function downloadPortalExperienceEvidence(token:WorkspacePortalToken,experienceId:string,evidenceId:string){
  const row=await transact(async tx=>{await lockExperienceEvidenceAccess(tx,token,experienceId);return tx.terraqoExperienceEvidence.findFirst({where:{id:evidenceId,experienceId},select:{...selected,storageKey:true}});});
  if(!row)throw new PortalExperienceEvidenceError("Evidencia no disponible.",404);
  const blob=await getWorklogEvidenceStore().getWithMetadata(row.storageKey,{type:"arrayBuffer"});
  await transact(tx=>lockExperienceEvidenceAccess(tx,token,experienceId));
  if(!blob)throw new PortalExperienceEvidenceError("El archivo ya no está disponible.",404);
  if(blob.data.byteLength!==row.size || row.size>8*1024*1024)throw new PortalExperienceEvidenceError("El archivo requiere revisión.",409);
  return new Response(blob.data,{headers:{"Content-Type":["application/pdf","image/jpeg","image/png","image/webp","image/avif"].includes(row.contentType)?row.contentType:"application/octet-stream","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(row.fileName).replace(/'/g,"%27")}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
