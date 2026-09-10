import {chromium} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {loadEnvConfig} from "@next/env";
import {createRequire} from "node:module";
import {mkdir} from "node:fs/promises";
import assert from "node:assert/strict";
import {encode} from "next-auth/jwt";
import {randomUUID} from "node:crypto";
loadEnvConfig(process.cwd());const require=createRequire(import.meta.url);
async function main(){
 const origin=process.env.LEGAL_AUDIT_ORIGIN||"http://localhost:3100";const browser=await chromium.launch({channel:"chrome",headless:true});const db=new PrismaClient();let id:number|undefined;let actorId:string|undefined;
 try{const page=await browser.newPage();await mkdir("output",{recursive:true});const report=[];
  for(const path of ["/legal","/terminos","/privacidad","/devoluciones","/libro-de-reclamaciones"]){
   await page.goto(origin+path);await page.getByRole("heading",{level:1}).waitFor();
   for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await page.addScriptTag({path:require.resolve("axe-core/axe.min.js")});const result=await page.evaluate(async()=>({overflow:document.documentElement.scrollWidth>innerWidth,violations:(await (window as unknown as {axe:{run:()=>Promise<{violations:{id:string;nodes:{target:string[]}[]}[]}>}}).axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}));report.push({path,width,...result});assert.equal(result.overflow,false);await page.screenshot({path:`output/legal-${path.slice(1)}-${width}.png`,fullPage:true});}
  }
  if(!process.env.LEGAL_AUDIT_ORIGIN){
   for(const [name,value] of Object.entries({name:"Prueba técnica del libro",document:"12345678",address:"Dirección técnica de prueba",email:"qa@example.invalid",item:"Prueba técnica",detail:"Prueba de navegación, no corresponde a una reclamación real.",request:"Verificar constancia",signature:"Prueba técnica"}))await page.locator(`[name="${name}"]`).fill(value);
   await page.getByRole("checkbox",{name:/Confirmo/}).check();await page.getByRole("button",{name:"Registrar hoja de reclamación"}).click();await page.getByRole("heading",{name:/Hoja registrada/}).waitFor({timeout:30000});
   const title=await page.getByRole("heading",{name:/Hoja registrada/}).innerText();id=Number(title.match(/TQ-(\d+)/)?.[1]);assert.ok(id);
   await db.terraqoComplaintMail.updateMany({where:{complaintId:id},data:{nextAttemptAt:new Date(Date.now()+86400000)}});
   const download=page.waitForEvent("download");await page.getByRole("button",{name:"Descargar constancia"}).click();assert.ok((await download).suggestedFilename().startsWith("TQ-"));
   await page.getByRole("button",{name:"Actualizar seguimiento"}).click();await page.waitForTimeout(1000);assert.ok(await page.getByRole("heading",{name:/Hoja registrada/}).isVisible());
   const actor=await db.user.create({data:{name:"Auditoría técnica",email:`legal-qa-${randomUUID()}@example.invalid`,role:"SUPER_ADMIN",emailVerified:new Date()}});actorId=actor.id;
   const token=await encode({secret:process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET!,salt:"authjs.session-token",token:{sub:actor.id,email:actor.email,name:actor.name,role:"SUPER_ADMIN"},maxAge:600});
   await page.context().addCookies([{name:"authjs.session-token",value:token,url:origin,httpOnly:true}]);
   await page.goto(`${origin}/admin/terraqo/reclamaciones?id=${id}`);await page.locator('textarea[name="response"]').fill("Respuesta de prueba técnica; no corresponde a un caso real.");
   await page.getByRole("button",{name:"Registrar respuesta definitiva"}).click();await page.waitForURL(/saved=1/);
   assert.ok((await db.terraqoComplaint.findUniqueOrThrow({where:{id}})).response);
   assert.equal((await db.terraqoComplaint.findUniqueOrThrow({where:{id}})).respondedAt,null);
   await db.terraqoComplaintMail.updateMany({where:{complaintId:id},data:{nextAttemptAt:new Date(Date.now()+86400000)}});
   await db.user.update({where:{id:actor.id},data:{role:"CUSTOMER"}});
   await page.goto(`${origin}/admin/terraqo/reclamaciones?id=${id}`);assert.equal(await page.locator('textarea[name="response"]').count(),0);
  }
  const denied=await page.request.post(origin+"/api/terraqo/complaints",{headers:{origin:"https://evil.example"},data:{}});assert.equal(denied.status(),403);
  console.log(JSON.stringify({report,crossOrigin:denied.status(),formTest:!process.env.LEGAL_AUDIT_ORIGIN}));
 }finally{if(id){await db.terraqoComplaintMail.deleteMany({where:{complaintId:id}});await db.terraqoComplaintEvent.deleteMany({where:{complaintId:id}});await db.terraqoComplaint.delete({where:{id}});}if(actorId)await db.user.delete({where:{id:actorId}});await browser.close();await db.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
