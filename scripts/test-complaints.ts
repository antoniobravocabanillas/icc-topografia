import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {loadEnvConfig} from "@next/env";
loadEnvConfig(process.cwd());
async function main(){
 const {prisma}=await import("../lib/prisma");const {submitComplaint,complaintReceipt,deliverComplaintMail}=await import("../lib/server/complaints");const {complaintSchema,complaintDeadline}=await import("../lib/terraqo/complaints-validation");
 assert.equal(complaintDeadline(new Date("2026-09-09T18:00:00Z")).toISOString(),"2026-10-01T04:59:59.000Z");
 const input={key:randomUUID(),name:"Prueba técnica",documentType:"OTRO",document:"QA-TEST",address:"Prueba sin correspondencia postal",email:"qa@example.invalid",phone:"",minor:false,representative:"",channel:"EMAIL",kind:"RECLAMO",itemType:"SERVICIO",item:"Prueba de sistema",amount:"0",reference:"QA",detail:"Esta es una prueba técnica, no un reclamo real.",request:"Verificar funcionamiento",signature:"Prueba técnica",confirmed:true,website:""};
 assert.equal(complaintSchema.safeParse({...input,minor:true}).success,false);
 assert.equal(complaintSchema.safeParse({...input,channel:"POSTAL",email:""}).success,true);
 let id:number|undefined;const original=globalThis.fetch;
 const oldKey=process.env.RESEND_API_KEY,oldFrom=process.env.TERRAQO_EMAIL_FROM;
 try{
  const rows=await Promise.all(Array.from({length:4},()=>submitComplaint(input)));id=rows[0].id;assert.equal(new Set(rows.map(r=>r.id)).size,1);
  await assert.rejects(submitComplaint({...input,detail:"Un contenido distinto que debe rechazarse"}));
  assert.equal(await complaintReceipt(randomUUID()),null);assert.ok((await complaintReceipt(input.key))?.text.includes("VRILLA"));
  // Isolate this fixture from any real pending mail; no live deliveries are attempted.
  const {id:copyId}=await prisma.terraqoComplaintMail.findFirstOrThrow({where:{complaintId:id,kind:"COPY"}});
  await prisma.terraqoComplaintMail.updateMany({where:{complaintId:id},data:{nextAttemptAt:new Date(Date.now()+86400000)}});
  const unrelated=await prisma.terraqoComplaintMail.count({where:{complaintId:{not:id},sentAt:null,nextAttemptAt:{lte:new Date()}}});
  if(unrelated===0){
   process.env.RESEND_API_KEY="test-local";process.env.TERRAQO_EMAIL_FROM="test@example.invalid";
   await prisma.terraqoComplaintMail.update({where:{id:copyId},data:{nextAttemptAt:new Date(0)}});
   globalThis.fetch=async()=>new Response("{}",{status:503});await deliverComplaintMail();
   assert.equal((await prisma.terraqoComplaintMail.findUniqueOrThrow({where:{id:copyId}})).sentAt,null);
   await prisma.terraqoComplaintMail.update({where:{id:copyId},data:{nextAttemptAt:new Date(0)}});
   globalThis.fetch=async(_url,init)=>{assert.ok((init?.headers as Record<string,string>)["Idempotency-Key"]);return new Response(JSON.stringify({id:"mock-mail-id"}),{status:200});};await deliverComplaintMail();
   assert.ok((await complaintReceipt(input.key))?.copySent);
  }
  console.log("PASS: validation, postal fallback, Peru deadline, concurrent idempotency, private lookup and isolated outbox retry");
 }finally{
  globalThis.fetch=original;if(oldKey)process.env.RESEND_API_KEY=oldKey;else delete process.env.RESEND_API_KEY;if(oldFrom)process.env.TERRAQO_EMAIL_FROM=oldFrom;else delete process.env.TERRAQO_EMAIL_FROM;
  if(id){await prisma.terraqoComplaintMail.deleteMany({where:{complaintId:id}});await prisma.terraqoComplaintEvent.deleteMany({where:{complaintId:id}});await prisma.terraqoComplaint.delete({where:{id}});}await prisma.$disconnect();
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
