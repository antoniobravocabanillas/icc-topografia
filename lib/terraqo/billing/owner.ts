import "server-only";
import { prisma } from "@/lib/prisma";
import { BillingError } from "./provider";
export async function authorizeBillingOwner(userId:string,workspaceId?:string){
  if(!workspaceId){
    const profile=await prisma.terraqoProfessionalProfile.findUnique({where:{userId},select:{id:true}});
    if(!profile)throw new BillingError("PERSONAL_PROFILE_REQUIRED",409);
    return {ownerKey:`user:${userId}`,workspaceId:null,userId,freeCode:"personal-free"};
  }
  const workspace=await prisma.terraqoWorkspace.findFirst({where:{id:workspaceId,ownerUserId:userId,active:true,deletedAt:null,type:"CLIENT_COMPANY"},select:{id:true}});
  if(!workspace)throw new BillingError("WORKSPACE_OWNER_REQUIRED",403);
  return {ownerKey:`workspace:${workspace.id}`,workspaceId:workspace.id,userId,freeCode:"workspace-free"};
}
