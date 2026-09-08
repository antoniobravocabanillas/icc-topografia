import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main(){
  const {prisma}=await import("../lib/prisma");
  const {checkout,cancelSubscription}=await import("../lib/terraqo/billing/service");
  const {periodEnd,BILLING_TERMS_VERSION}=await import("../lib/terraqo/billing/catalog");
  const {billingContinuation}=await import("../lib/terraqo/billing/continuation");
  const {reserveMonthlyUsage}=await import("../lib/terraqo/billing/entitlements");
  const {boundedJson}=await import("../lib/terraqo/billing/request-security");
  assert.equal(process.env.CULQI_MODE,"test","Tests are sandbox-only");
  assert.equal(periodEnd(new Date("2026-01-31T12:00:00Z"),"MONTHLY").toISOString(),"2026-02-28T12:00:00.000Z");
  assert.equal(periodEnd(new Date("2024-02-29T12:00:00Z"),"ANNUAL").toISOString(),"2025-02-28T12:00:00.000Z");
  assert.equal(billingContinuation("//evil.example/membresia"),null);
  assert.equal(billingContinuation("/\\evil.example/membresia"),null);
  assert.ok(billingContinuation("/membresia?plan=personal-pro&cycle=ANNUAL")?.startsWith("/portal/membresia?"));
  await assert.rejects(boundedJson(new Request("http://localhost",{method:"POST",body:"x".repeat(12001)})));
  const uid=randomUUID().replaceAll("-","");
  const user=await prisma.user.create({data:{name:"Billing automated QA",email:`billing-${uid}@example.invalid`,emailVerified:new Date(),role:"CUSTOMER"}});
  await prisma.terraqoProfessionalProfile.create({data:{userId:user.id}});
  const original=globalThis.fetch;let creations=0;let cancelled=false;let accountId="";
  const subscriptionId=`sxn_test_${uid}`;const chargeId=`chr_test_${uid}`;
  const mapping=await prisma.terraqoBillingPlan.findFirstOrThrow({where:{code:"personal-pro",cycle:"MONTHLY",mode:"test",enabled:true}});
  globalThis.fetch=async(input,init)=>{
    const url=String(input);assert.ok(url.startsWith("https://api.culqi.com/v2/"));
    let data:unknown;
    if(url.includes("/recurrent/plans/"))data={amount:2900,currency:"PEN",interval_unit_time:3,status:1};
    else if(url.includes("/tokens/"))data={email:"review@culqi.com"};
    else if(url.endsWith("/customers"))data={id:`cus_test_${uid}`};
    else if(url.endsWith("/cards"))data={id:`crd_test_${uid}`};
    else if(url.endsWith("/subscriptions/create")){creations++;data={id:subscriptionId};}
    else if(url.endsWith(`/subscriptions/${subscriptionId}`)&&init?.method==="DELETE"){cancelled=true;data={id:subscriptionId};}
    else if(url.endsWith(`/subscriptions/${subscriptionId}`))data={id:subscriptionId,status:cancelled?4:3,plan:{plan_id:mapping.providerId},periods:[{charges:[{charge_id:chargeId,charger_status:1}]}]};
    else if(url.endsWith(`/charges/${chargeId}`))data={id:chargeId,amount:2900,currency_code:"PEN",outcome:{type:"venta_exitosa"},capture:true,creation_date:Date.now(),amount_refunded:0};
    else throw new Error("Unexpected provider request");
    return new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const input={planCode:"personal-pro",cycle:"MONTHLY" as const,idempotencyKey:randomUUID(),tokenId:`tkn_test_${uid}`,consent:true as const,termsVersion:BILLING_TERMS_VERSION,customer:{firstName:"Prueba",lastName:"Terraqo",address:"Direccion de prueba",city:"Lima",country:"PE" as const,phone:"999999999"}};
    const results=await Promise.allSettled(Array.from({length:6},()=>checkout(user,input)));
    assert.equal(creations,1,"Concurrent retries must create exactly one provider subscription");
    assert.ok(results.some(result=>result.status==="fulfilled"));
    const account=await prisma.terraqoBillingAccount.findFirstOrThrow({where:{userId:user.id}});accountId=account.id;
    assert.equal(account.status,"ACTIVE");
    assert.equal(await prisma.terraqoBillingPayment.count({where:{accountId}}),1);
    assert.equal((await prisma.terraqoProfessionalProfile.findUniqueOrThrow({where:{userId:user.id}})).planTier,"FREE","Sandbox must not grant live access");
    await assert.rejects(checkout(user,{...input,cycle:"ANNUAL"}));
    await assert.rejects(cancelSubscription(accountId,"not-the-owner"));
    await cancelSubscription(accountId,user.id);
    const after=await prisma.terraqoBillingAccount.findUniqueOrThrow({where:{id:accountId}});
    assert.equal(after.cancelAtPeriodEnd,true);assert.ok(after.paidThrough&&after.paidThrough>new Date());
    const quota=await Promise.allSettled(Array.from({length:20},()=>reserveMonthlyUsage(user.id,"ai")));
    assert.equal(quota.filter(result=>result.status==="fulfilled").length,10,"Concurrent quota cannot overshoot free allowance");
    console.log("PASS: month-end/leap-year, redirect allowlist, body bound, concurrent checkout, idempotency, payment uniqueness, sandbox isolation, ownership, cancellation, atomic quota");
  }finally{
    globalThis.fetch=original;
    // Only exact synthetic fixture IDs are removed, never application accounts.
    const fixtureAccounts=await prisma.terraqoBillingAccount.findMany({where:{userId:user.id},select:{id:true}});
    const ids=fixtureAccounts.map(x=>x.id);
    await prisma.$transaction([
      prisma.terraqoBillingAudit.deleteMany({where:{OR:[{accountId:{in:ids}},{actorId:user.id}]}}),
      prisma.terraqoBillingPayment.deleteMany({where:{accountId:{in:ids}}}),
      prisma.terraqoBillingAttempt.deleteMany({where:{accountId:{in:ids}}}),
      prisma.terraqoBillingAccount.deleteMany({where:{id:{in:ids},userId:user.id}}),
      prisma.terraqoUsageBucket.deleteMany({where:{ownerKey:`user:${user.id}`}}),
      prisma.terraqoProfessionalProfile.deleteMany({where:{userId:user.id}}),
      prisma.user.delete({where:{id:user.id}}),
    ]);
    await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Billing tests failed");process.exitCode=1;});
