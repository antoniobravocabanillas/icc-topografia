import "server-only";
import { prisma } from "@/lib/prisma";
import { BILLING_PLANS, getBillingPlan } from "./catalog";
import { BillingError } from "./provider";

// Production access never reads sandbox accounts. Expiration is evaluated on every request,
// independently of the scheduler and of a cached tier in an older profile.
export async function effectivePlan(userId:string,workspaceId?:string){
  const ownerKey=workspaceId?`workspace:${workspaceId}`:`user:${userId}`;
  const account=await prisma.terraqoBillingAccount.findUnique({where:{ownerKey_mode:{ownerKey,mode:"live"}}});
  const audience=workspaceId?"WORKSPACE":"PERSONAL";
  if(account)return account.paidThrough&&account.paidThrough>new Date()?getBillingPlan(account.planCode):getBillingPlan(workspaceId?"workspace-free":"personal-free");
  // Preserve explicitly granted legacy contracts; never turn an existing paid customer into free.
  const tier=workspaceId?(await prisma.terraqoSubscription.findFirst({where:{workspaceId,status:{in:["ACTIVE","TRIALING"]}},orderBy:{createdAt:"desc"},select:{tier:true}}))?.tier:(await prisma.terraqoProfessionalProfile.findUnique({where:{userId},select:{planTier:true}}))?.planTier;
  return BILLING_PLANS.find(p=>p.audience===audience&&p.tier===(tier||"FREE"))||getBillingPlan(workspaceId?"workspace-free":"personal-free");
}

export async function reserveMonthlyUsage(userId:string,metric:"ai"|"automation",workspaceId?:string){
  const plan=await effectivePlan(userId,workspaceId);
  const limit=metric==="ai"?plan.aiActions:plan.automationRuns;
  const key={ownerKey:workspaceId?`workspace:${workspaceId}`:`user:${userId}`,period:new Date().toISOString().slice(0,7),metric};
  await prisma.$transaction(async tx=>{
    await tx.terraqoUsageBucket.createMany({data:[key],skipDuplicates:true});
    const reserved=await tx.terraqoUsageBucket.updateMany({where:{...key,used:{lt:limit}},data:{used:{increment:1}}});
    if(!reserved.count)throw new BillingError("MONTHLY_QUOTA_REACHED",429);
  },{maxWait:15000,timeout:10000});
  let released=false;
  return {release:async()=>{if(released)return;released=true;await prisma.terraqoUsageBucket.updateMany({where:{...key,used:{gt:0}},data:{used:{decrement:1}}});}};
}
