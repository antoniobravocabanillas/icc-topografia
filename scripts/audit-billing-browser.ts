import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
loadEnvConfig(process.cwd());
const require=createRequire(import.meta.url);
async function main(){
  const db=new PrismaClient();
  const user=await db.user.create({data:{name:"Prueba de facturacion",email:`billing-browser-${randomUUID()}@example.invalid`,emailVerified:new Date(),role:"CUSTOMER"}});
  await db.terraqoProfessionalProfile.create({data:{userId:user.id}});
  const browser=await chromium.launch({channel:"chrome",headless:true});
  const context=await browser.newContext();const page=await context.newPage();
  const origin=process.env.BILLING_AUDIT_ORIGIN||"http://127.0.0.1:3100";
  const cookieName=origin.startsWith("https:")?"__Secure-authjs.session-token":"authjs.session-token";
  try{
    const token=await encode({secret:process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET!,salt:cookieName,token:{sub:user.id,name:user.name,email:user.email,role:"CUSTOMER"},maxAge:3600});
    await context.addCookies([{name:cookieName,value:token,url:origin,httpOnly:true,secure:origin.startsWith("https:"),sameSite:"Lax"}]);
    if(origin==="https://terraqoglobal.com")await context.addCookies([{name:cookieName,value:token,url:"https://portal.terraqoglobal.com",httpOnly:true,secure:true,sameSite:"Lax"}]);
    await mkdir("output",{recursive:true});
    await page.goto(`${origin}/portal/membresia?plan=personal-pro&cycle=MONTHLY`);
    await page.getByRole("heading",{name:"Datos de facturación"}).waitFor({timeout:60000});
    await page.waitForFunction(()=>Boolean(window.CulqiCheckout&&window.Culqi3DS),{timeout:30000});
    if(process.env.CULQI_INSPECT_CHECKOUT==="true"){
      for(const [name,value] of Object.entries({firstName:"Prueba",lastName:"Terraqo",address:"Direccion de pruebas 123",city:"Lima",phone:"999999999"}))await page.locator(`input[name=${name}]`).fill(value);
      await page.getByRole("checkbox").check();
      await page.getByRole("button",{name:/Pagar/}).click();
      await page.waitForTimeout(4000);
      if(process.env.CULQI_E2E==="true"){
        assert.equal(process.env.CULQI_MODE,"test");
        const frame=page.frames().find(f=>f.url().startsWith("https://checkoutview.culqi.com/"));assert.ok(frame);
        // Official public sandbox fixture. Card data goes only into Culqi's cross-origin iframe.
        await frame.locator('input[name="tarjeta"]').fill("4111111111111111");
        await frame.locator('input[name="fecha"]').fill("0930");
        await frame.locator('input[name="cvv"]').fill("123");
        const resultPromise=page.waitForResponse(r=>r.url().includes("/api/terraqo/billing")&&r.request().method()==="POST",{timeout:60000});
        await frame.getByRole("button",{name:/Pagar/}).click();
        const response=await resultPromise;const result=await response.json();
        console.log(JSON.stringify({sandboxCheckout:{http:response.status(),status:result.status,error:result.error,uncertain:result.uncertain}}));
        const account=await db.terraqoBillingAccount.findFirst({where:{userId:user.id,mode:"test"}});
        if(account?.subscriptionId){const cancel=await context.request.patch(origin+"/api/terraqo/billing",{headers:{origin},data:{accountId:account.id,action:"cancel"}});console.log(JSON.stringify({sandboxCancellation:cancel.status()}));}
        assert.equal((await db.terraqoProfessionalProfile.findUniqueOrThrow({where:{userId:user.id}})).planTier,"FREE");
        return;
      }
      const frames=[];for(const frame of page.frames()){frames.push({url:frame.url().split("?")[0],inputs:await frame.locator("input").evaluateAll(elements=>elements.map(e=>({name:e.getAttribute("name"),placeholder:e.getAttribute("placeholder"),type:e.getAttribute("type")})))});}
      console.log(JSON.stringify({hostedCheckout:frames}));
      await page.screenshot({path:"output/billing-hosted-checkout.png",fullPage:true});
      return;
    }
    const report=[];
    for(const path of ["/membresias","/portal/membresia?plan=personal-pro&cycle=MONTHLY"]){
      await page.goto(origin+path);await page.getByRole("heading",{level:1}).waitFor();
      for(const width of [360,390,1440]){
        await page.setViewportSize({width,height:960});
        await page.addScriptTag({path:require.resolve("axe-core/axe.min.js")});
        const metrics=await page.evaluate(async()=>({overflow:document.documentElement.scrollWidth>innerWidth,violations:(await (window as unknown as {axe:{run:()=>Promise<{violations:{id:string;impact:string;nodes:{target:string[];failureSummary:string}[]}[]}>}}).axe.run()).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,reason:n.failureSummary}))}))}));
        report.push({path,width,...metrics});
        await page.screenshot({path:`output/billing-${path.startsWith("/portal")?"checkout":"plans"}-${width}.png`,fullPage:true});
      }
    }
    const csrf=await context.request.patch(origin+"/api/terraqo/billing",{headers:{origin:"https://evil.example"},data:{accountId:"invalid",action:"cancel"}});
    assert.equal(csrf.status(),403);
    const idor=await context.request.patch(origin+"/api/terraqo/billing",{headers:{origin},data:{accountId:"clzzzzzzzzzzzzzzzzzzzzzzzz",action:"cancel"}});
    assert.equal(idor.status(),404);
    console.log(JSON.stringify({report,security:{csrf:csrf.status(),foreignAccount:idor.status()},hostedSdkLoaded:true}));
  }finally{
    await browser.close();
    await db.terraqoUsageBucket.deleteMany({where:{ownerKey:`user:${user.id}`}});
    if(!await db.terraqoBillingAccount.count({where:{userId:user.id}})){
      await db.terraqoProfessionalProfile.deleteMany({where:{userId:user.id}});
      await db.user.delete({where:{id:user.id}});
    }else console.log("Sandbox payment ledger retained for audit; synthetic profile remains private.");
    await db.$disconnect();
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Browser audit failed");process.exitCode=1;});
