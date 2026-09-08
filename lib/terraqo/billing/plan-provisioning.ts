import "server-only";
import { prisma } from "@/lib/prisma";
import { BILLING_PLANS,CATALOG_VERSION,planAmount,supportsBillingCycle,type BillingCycle } from "./catalog";
import { billingMode,BillingError,culqi,providerId } from "./provider";
export async function provisionConfiguredPlans(actorId?:string){
  const mode=billingMode();
  const key={ownerKey:"system:billing-plan-provision",period:`${mode}:${CATALOG_VERSION}`,metric:"lease"};
  const minute=Math.floor(Date.now()/60000);const lease=minute+10;
  await prisma.terraqoUsageBucket.createMany({data:[key],skipDuplicates:true});
  const claimed=await prisma.terraqoUsageBucket.updateMany({where:{...key,used:{lte:minute}},data:{used:lease}});
  if(!claimed.count)throw new BillingError("PLAN_PROVISIONING_BUSY",409);
  try{
  // A platform administrator invokes this deliberately; never during a customer checkout.
  const list=(await culqi("/recurrent/plans?limit=100")).data;
  const available=Array.isArray(list.data)?list.data as Record<string,unknown>[]:[];
  if(Number((list.paging as Record<string,unknown>|undefined)?.remaining_items||0)>0)throw new BillingError("PLAN_LIST_REQUIRES_REVIEW",409);
  const result=[];
  for(const plan of BILLING_PLANS.filter(p=>p.monthlyMinor>0))for(const cycle of ["MONTHLY","ANNUAL"] as BillingCycle[]){
    if(!supportsBillingCycle(plan,cycle)){result.push({code:plan.code,cycle,status:"provider_limit"});continue;}
    const amount=planAmount(plan,cycle);
    const saved=await prisma.terraqoBillingPlan.findUnique({where:{code_version_cycle_mode:{code:plan.code,version:CATALOG_VERSION,cycle,mode}}});
    if(saved){result.push({code:plan.code,cycle,status:"existing"});continue;}
    const matches=available.filter(p=>{const m=p.metadata as Record<string,unknown>|undefined;return m?.terraqo_code===plan.code&&m.terraqo_cycle===cycle&&m.terraqo_version===CATALOG_VERSION;});
    if(matches.length>1)throw new BillingError("DUPLICATE_PROVIDER_PLANS",409);
    let id=matches[0]?.id;
    if(!id){
      const p=(await culqi("/recurrent/plans/create","POST",{name:`Terraqo ${plan.name} ${cycle==="ANNUAL"?"anual":"mensual"}`,short_name:`tq-${plan.code}-${cycle.toLowerCase()}-202609`,description:mode==="test"?`Sandbox Terraqo ${plan.name}. Tres ciclos de prueba.`:`Terraqo ${plan.name}. Renovacion hasta cancelacion.`,amount,currency:"PEN",interval_unit_time:cycle==="ANNUAL"?4:3,interval_count:mode==="test"?3:0,initial_cycles:{count:0,has_initial_charge:false,amount:0,interval_unit_time:cycle==="ANNUAL"?4:3},metadata:{terraqo_code:plan.code,terraqo_cycle:cycle,terraqo_version:CATALOG_VERSION}})).data;
      id=p.id;
    }
    const provider=providerId(id,"pln",mode);
    const detail=(await culqi(`/recurrent/plans/${provider}`)).data;
    if(detail.amount!==amount||detail.currency!=="PEN"||detail.interval_unit_time!==(cycle==="ANNUAL"?4:3)||detail.status!==1)throw new BillingError("PROVIDER_PLAN_CONTRACT_MISMATCH",409);
    await prisma.terraqoBillingPlan.create({data:{code:plan.code,version:CATALOG_VERSION,cycle,mode,amountMinor:amount,providerId:provider,enabled:true}});
    await prisma.terraqoBillingAudit.create({data:{actorId,action:"BILLING_PLAN_PROVISIONED",detail:{mode,code:plan.code,cycle,amountMinor:amount,providerId:provider}}});
    result.push({code:plan.code,cycle,status:"verified"});
  }
  return result;
  }finally{await prisma.terraqoUsageBucket.updateMany({where:{...key,used:lease},data:{used:0}});}
}
export async function provisionSandboxPlans(actorId?:string){
  if(billingMode()!=="test")throw new BillingError("SANDBOX_ONLY",403);
  return provisionConfiguredPlans(actorId);
}
