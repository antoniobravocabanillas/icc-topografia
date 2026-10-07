import { prisma } from "@/lib/prisma";
import type { reserveStorage } from "@/lib/terraqo/billing/storage-quota";
import { getProfessionalDocumentStore } from "./media";
import { recoverProfessionalDocumentCleanup } from "./professional-document-cleanup";

export type ReservedPrivateUpload = {type:string; file:File; storageKey:string};
export async function reservePrivateUploadFiles<T extends ReservedPrivateUpload>(userId:string, files:readonly T[], reserve:typeof reserveStorage, onReserved:(file:T)=>void) {
  // Recovery refunds ceil(bytes / MB) per file. Reserve the same units per file,
  // including entries reserved before a later reservation or write fails.
  for(const file of files){await reserve(userId,file.file.size);onReserved(file);}
}
export async function compensatePrivateUploadFiles(userId:string, workspaceId:string, files:readonly ReservedPrivateUpload[], store:Pick<ReturnType<typeof getProfessionalDocumentStore>,"delete">, recover= recoverProfessionalDocumentCleanup) {
  let failed=false;
  for(const file of files){
    try{
      // Persist first: a DB failure prevents deletion and preserves quota.
      // Recovery also guards live references after an uncertain upload commit.
      const audit=await prisma.activityLog.create({data:{actorId:userId,terraqoWorkspaceId:workspaceId,
        action:"DELETED",entityType:"ProfessionalDocument",entityId:file.storageKey,title:"Limpieza de carga pendiente",
        metadata:{source:"native-portal",type:file.type,storageCleanupState:"PENDING",storageCleanupKey:file.storageKey,storageCleanupBytes:file.file.size}},select:{id:true}});
      await recover(audit.id,store);
    }catch{failed=true;} // Attempt every reserved entry; do not strand later files.
  }
  if(failed)throw new Error("Private upload compensation requires investigation.");
}
