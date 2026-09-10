import {NextResponse} from "next/server";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {assertBillingOrigin,billingUser} from "@/lib/terraqo/billing/authorization";
import {boundedJson,billingRateLimit} from "@/lib/terraqo/billing/request-security";
import {BillingError} from "@/lib/terraqo/billing/provider";
import {getDefaultModulesForTier} from "@/lib/workspace";
export async function POST(request:Request){try{
  assertBillingOrigin(request);const user=await billingUser();await billingRateLimit(user.id);
  if(!user.emailVerified)throw new BillingError("VERIFY_EMAIL_FIRST",403);
  const input=z.object({name:z.string().trim().min(2).max(120),key:z.string().uuid()}).strict().parse(await boundedJson(request,2048));
  // Identity and ownership come only from the session; retries never create duplicate workspaces.
  const workspace=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace:${user.id}`}))`;
    const slug=`empresa-${input.key}`;const existing=await tx.terraqoWorkspace.findUnique({where:{slug}});
    if(existing){if(existing.ownerUserId!==user.id)throw new BillingError("WORKSPACE_OWNER_REQUIRED",403);return existing;}
    return tx.terraqoWorkspace.create({data:{name:input.name,slug,type:"CLIENT_COMPANY",ownerUserId:user.id,
      members:{create:{userId:user.id,role:"OWNER",active:true,joinedAt:new Date()}},
      subscriptions:{create:{tier:"FREE",status:"ACTIVE",seats:1}},
      modules:{create:getDefaultModulesForTier("FREE").map(code=>({code,active:true,enabledAt:new Date()}))}
    }});
  });return NextResponse.json({id:workspace.id,name:workspace.name},{headers:{"Cache-Control":"no-store"}});
}catch(error){const code=error instanceof BillingError?error.code:error instanceof z.ZodError?"INVALID_WORKSPACE":"WORKSPACE_UNAVAILABLE";return NextResponse.json({error:code},{status:error instanceof BillingError?error.status:error instanceof z.ZodError?422:503});}}
