import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertBillingOrigin, billingUser, authorizeBillingOwner } from "@/lib/terraqo/billing/authorization";
import { BILLING_PLANS, BILLING_TERMS_VERSION, CATALOG_VERSION } from "@/lib/terraqo/billing/catalog";
import { billingMode, BillingError, providerCredentials } from "@/lib/terraqo/billing/provider";
import { checkoutSchema } from "@/lib/terraqo/billing/validation";
import { checkout, cancelSubscription, reconcileAccount, abandonAuthentication } from "@/lib/terraqo/billing/service";
import { boundedJson, billingRateLimit } from "@/lib/terraqo/billing/request-security";
import { z } from "zod";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
function errorResponse(error:unknown){
  const safe=error instanceof BillingError?error:new BillingError("BILLING_UNAVAILABLE",503);
  return NextResponse.json({error:safe.code,uncertain:safe.uncertain},{status:safe.status,headers});
}
export async function GET(){
  try{
    const user=await billingUser();const mode=billingMode();
    const [accounts,workspaces,mappings]=await Promise.all([
      prisma.terraqoBillingAccount.findMany({where:{userId:user.id,mode},include:{payments:{orderBy:{paidAt:"desc"},take:24}},orderBy:{updatedAt:"desc"}}),
      prisma.terraqoWorkspace.findMany({where:{ownerUserId:user.id,active:true,deletedAt:null,type:"CLIENT_COMPANY"},select:{id:true,name:true}}),
      prisma.terraqoBillingPlan.findMany({where:{mode,version:CATALOG_VERSION,enabled:true},select:{code:true,cycle:true}}),
    ]);
    const attempts=await prisma.terraqoBillingAttempt.findMany({where:{id:{in:accounts.flatMap(a=>a.currentAttemptId?[a.currentAttemptId]:[])}},select:{id:true,status:true}});
    let publicKey:string|null=null;try{publicKey=providerCredentials().publicKey;}catch{}
    return NextResponse.json({plans:BILLING_PLANS,mode,publicKey,termsVersion:BILLING_TERMS_VERSION,email:mode==="test"?"review@culqi.com":user.email,emailVerified:Boolean(user.emailVerified),workspaces,mappings,accounts:accounts.map(a=>({id:a.id,workspaceId:a.workspaceId,planCode:a.planCode,cycle:a.cycle,status:a.status,paidThrough:a.paidThrough,cancelAtPeriodEnd:a.cancelAtPeriodEnd,pending:Boolean(a.currentAttemptId&&(!a.paidThrough||a.paidThrough<=new Date())),canAbandon:attempts.some(t=>t.id===a.currentAttemptId&&t.status==="NEEDS_3DS"),payments:a.payments.map(p=>({id:p.id,amountMinor:p.amountMinor,currency:p.currency,paidAt:p.paidAt,periodEnd:p.periodEnd,refundedMinor:p.refundedMinor}))}))},{headers});
  }catch(error){return errorResponse(error);}
}
export async function POST(request:Request){
  try{
    assertBillingOrigin(request);const user=await billingUser();
    await billingRateLimit(user.id);
    const parsed=checkoutSchema.safeParse(await boundedJson(request));
    if(!parsed.success)throw new BillingError("INVALID_CHECKOUT_DATA",422);
    return NextResponse.json(await checkout(user,parsed.data),{headers});
  }catch(error){return errorResponse(error);}
}
export async function PATCH(request:Request){
  try{
    assertBillingOrigin(request);const user=await billingUser();
    await billingRateLimit(user.id);
    const parsed=z.object({accountId:z.string().cuid(),action:z.enum(["cancel","refresh","abandon"])}).strict().safeParse(await boundedJson(request,1024));
    if(!parsed.success)throw new BillingError("INVALID_ACTION");
    const payload=parsed.data;
    const account=await prisma.terraqoBillingAccount.findFirst({where:{id:payload.accountId,userId:user.id,mode:billingMode()}});
    if(!account)throw new BillingError("ACCOUNT_NOT_FOUND",404);
    await authorizeBillingOwner(user.id,account.workspaceId||undefined);
    if(payload.action==="cancel")await cancelSubscription(account.id,user.id);
    else if(payload.action==="abandon")await abandonAuthentication(account.id,user.id);
    else if(!account.lastReconciledAt||Date.now()-account.lastReconciledAt.getTime()>15000)await reconcileAccount(account.id);
    return NextResponse.json({ok:true},{headers});
  }catch(error){return errorResponse(error);}
}
