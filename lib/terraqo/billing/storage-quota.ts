import "server-only";
import { prisma } from "@/lib/prisma";
import { effectivePlan } from "./entitlements";
import { BillingError } from "./provider";
const megabytes=(bytes:number)=>Math.ceil(bytes/1_000_000);
export async function reserveStorage(userId:string,bytes:number,workspaceId?:string){
  if(!Number.isSafeInteger(bytes)||bytes<1)throw new BillingError("INVALID_STORAGE_SIZE");
  const plan=await effectivePlan(userId,workspaceId);
  const key={ownerKey:workspaceId?`workspace:${workspaceId}`:`user:${userId}`,period:"retained",metric:"storage-mb"};
  const units=megabytes(bytes);
  const exists=await prisma.terraqoUsageBucket.findUnique({where:{ownerKey_period_metric:key},select:{id:true}});
  let baseline=0;
  if(!exists){
    if(workspaceId){const aggregate=await prisma.terraqoWorkspaceFile.aggregate({where:{workspaceId},_sum:{size:true}});baseline=megabytes(aggregate._sum.size||0);}
    else{
      const aggregates=await Promise.all([
        prisma.terraqoProfessionalDocument.aggregate({where:{professionalProfile:{userId}},_sum:{size:true}}),
        prisma.terraqoWorklogMedia.aggregate({where:{worklog:{authorId:userId}},_sum:{size:true}}),
        prisma.terraqoMessageAttachment.aggregate({where:{message:{senderId:userId}},_sum:{size:true}}),
      ]);
      baseline=megabytes(aggregates.reduce((sum,row)=>sum+(row._sum.size||0),0));
    }
  }
  await prisma.$transaction(async tx=>{
    await tx.terraqoUsageBucket.createMany({data:[{...key,used:baseline}],skipDuplicates:true});
    const reserved=await tx.terraqoUsageBucket.updateMany({where:{...key,used:{lte:plan.storageMb-units}},data:{used:{increment:units}}});
    if(!reserved.count)throw new BillingError("STORAGE_QUOTA_REACHED",429);
  },{maxWait:15000,timeout:10000});
  let released=false;
  return {release:async()=>{if(released)return;released=true;await prisma.terraqoUsageBucket.updateMany({where:{...key,used:{gte:units}},data:{used:{decrement:units}}});}};
}
export async function releaseWorkspaceStorage(workspaceId:string,bytes:number){
  const units=megabytes(bytes);
  await prisma.terraqoUsageBucket.updateMany({where:{ownerKey:`workspace:${workspaceId}`,period:"retained",metric:"storage-mb",used:{gte:units}},data:{used:{decrement:units}}});
}
