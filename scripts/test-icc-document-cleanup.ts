import { reservePrivateUploadFiles, compensatePrivateUploadFiles } from "../lib/server/native-professional-upload-compensation";
import { reserveStorage } from "../lib/terraqo/billing/storage-quota";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { getStore } from "@netlify/blobs";
import { prisma } from "../lib/prisma";
import { dueProfessionalDocumentCleanupIds, professionalDocumentCleanupBacklog } from "../lib/server/professional-document-cleanup";
import { PROFESSIONAL_DOCUMENT_STORE } from "../lib/server/media";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,"icc-topografia:20616116313");
  assert.ok((process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET || "").length>=32);
  const helpers=await import(pathToFileURL(join(process.env.APPDATA!,"npm/node_modules/netlify-cli/dist/utils/command-helpers.js")).href);
  const [token]=await helpers.getToken(); assert.ok(token);
  const store=getStore({name:PROFESSIONAL_DOCUMENT_STORE,siteID:"2d38524a-44f9-4473-8a1f-9270e03bc2bf",token,consistency:"strong"});
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:"icc-topografia",active:true,deletedAt:null,companies:{some:{document:"20616116313",deletedAt:null}}},select:{id:true}});
  const password=randomBytes(24).toString("hex"), email=`cleanup-${randomUUID()}@example.test`;
  const user=await prisma.user.create({data:{email,name:"Prueba recuperación privada",role:"CUSTOMER",emailVerified:new Date(),passwordHash:await bcrypt.hash(password,12),
    terraqoMemberships:{create:{workspaceId:workspace.id,role:"PROFESSIONAL",active:true}},terraqoProfessionalProfile:{create:{}}},select:{id:true,terraqoProfessionalProfile:{select:{id:true}}}});
  const base="https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/";
  let key:string|undefined;const extraKeys:string[]=[];
  const internal=(body:unknown, authorized=true)=>fetch("https://api.terraqoglobal.com/api/internal/professional-document-cleanup",{method:"POST",headers:{"content-type":"application/json",...(authorized?{authorization:`Bearer ${process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET}`}:{})},body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(55000)});
  try {
    assert.equal((await internal({auditId:"fixture"},false)).status,401);
    assert.ok((await dueProfessionalDocumentCleanupIds()).length <= 5, "Deployed database supports the bounded retry eligibility query.");
    const login=await fetch(base+"login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password}),redirect:"error"});assert.equal(login.status,200);
    const bearer=(await login.json()).data.token;
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGMsAAAAASUVORK5CYII=","base64");
    const form=new FormData();form.set("purpose","document");form.set("documentType","OTHER");form.set("documentFile",new File([png],"cleanup-fixture.png",{type:"image/png"}));
    const upload=await fetch(base+"documents",{method:"POST",headers:{authorization:`Bearer ${bearer}`,"x-terraqo-native-upload":"1"},body:form,redirect:"error"});assert.equal(upload.status,200);
    const id=(await upload.json()).data.documents[0].id;
    const document=await prisma.terraqoProfessionalDocument.findFirstOrThrow({where:{id,professionalProfileId:user.terraqoProfessionalProfile!.id}});key=document.storageKey;
    assert.deepEqual(Buffer.from((await store.getWithMetadata(key,{type:"arrayBuffer"}))!.data),png);
    const audit=await prisma.activityLog.create({data:{actorId:user.id,terraqoWorkspaceId:workspace.id,action:"DELETED",entityType:"ProfessionalDocument",entityId:id,title:"Fixture limpieza privada",metadata:{source:"native-portal",type:"OTHER",storageCleanupState:"PENDING",storageCleanupKey:key,storageCleanupBytes:document.size}},select:{id:true}});
    assert.equal((await (await internal({auditId:audit.id})).json()).result,"blocked");
    assert.ok(await store.getWithMetadata(key,{type:"arrayBuffer"}));
    const health=await professionalDocumentCleanupBacklog();assert.ok(health.pending>=1);
    assert.ok(Object.values(health).every(value=>Number.isSafeInteger(value)&&value>=0));
    // Simulate only our interrupted compensation after its logical removal.
    await prisma.terraqoProfessionalDocument.delete({where:{id}});
    const before=await prisma.terraqoUsageBucket.findFirstOrThrow({where:{ownerKey:`user:${user.id}`,metric:"storage-mb",period:"retained"}});assert.equal(before.used,1);
    const responses=await Promise.all(Array.from({length:3},()=>internal({auditId:audit.id})));
    for(const response of responses)assert.equal(response.status,200);
    const results=await Promise.all(responses.map(response=>response.json()));
    assert.equal(results.filter(result=>result.result==="completed").length,1);assert.equal(results.filter(result=>result.result==="skipped").length,2);
    assert.equal(await store.getWithMetadata(key,{type:"arrayBuffer"}),null);
    const after=await prisma.terraqoUsageBucket.findFirstOrThrow({where:{id:before.id}});assert.equal(after.used,0);
    const marker=await prisma.activityLog.findUniqueOrThrow({where:{id:audit.id},select:{metadata:true}});
    assert.deepEqual(marker.metadata,{source:"native-portal",type:"OTHER",storageCleanupState:"COMPLETE"});
    assert.equal((await (await internal({auditId:audit.id})).json()).result,"skipped");
    const pair=["DNI_FRONT","DNI_BACK"].map(type=>({type,file:new File([png],`${type}.png`,{type:"image/png"}),storageKey:`professional-documents/${user.terraqoProfessionalProfile!.id}/${type.toLowerCase()}/${randomUUID()}.png`}));
    extraKeys.push(...pair.map(item=>item.storageKey));
    const reserved:typeof pair=[];await reservePrivateUploadFiles(user.id,pair,reserveStorage,item=>reserved.push(item));
    assert.equal((await prisma.terraqoUsageBucket.findUniqueOrThrow({where:{id:before.id}})).used,2);
    for(const item of pair)await store.set(item.storageKey,await item.file.arrayBuffer());
    await compensatePrivateUploadFiles(user.id,workspace.id,reserved,{delete:async(storageKey:string)=>{if(storageKey===pair[1].storageKey)throw new Error("Synthetic partial failure.");await store.delete(storageKey);}});
    assert.equal(await store.getWithMetadata(pair[0].storageKey,{type:"arrayBuffer"}),null);assert.ok(await store.getWithMetadata(pair[1].storageKey,{type:"arrayBuffer"}));
    assert.equal((await prisma.terraqoUsageBucket.findUniqueOrThrow({where:{id:before.id}})).used,1);
    const retry=await prisma.activityLog.findFirstOrThrow({where:{actorId:user.id,entityId:pair[1].storageKey,entityType:"ProfessionalDocument",action:"DELETED"},select:{id:true,metadata:true}});
    assert.equal((retry.metadata as {storageCleanupState:string}).storageCleanupState,"PENDING");
    const retries=await Promise.all([internal({auditId:retry.id}),internal({auditId:retry.id})]);for(const response of retries)assert.equal(response.status,200);
    assert.equal(await store.getWithMetadata(pair[1].storageKey,{type:"arrayBuffer"}),null);assert.equal((await prisma.terraqoUsageBucket.findUniqueOrThrow({where:{id:before.id}})).used,0);
    console.log("PASS pair compensation: two rounded reservations, first blob removed/refunded, second failure retains one unit and durable marker, concurrent recovery refunds once.");
    console.log("PASS deployed cleanup: unauthenticated rejection, retained-document guard, actual blob removal, three concurrent retries, one quota refund and replay guard.");
  } finally {
    if(key)await store.delete(key);for(const extraKey of extraKeys)await store.delete(extraKey);
    await prisma.activityLog.deleteMany({where:{actorId:user.id,terraqoWorkspaceId:workspace.id,entityType:"ProfessionalDocument"}});
    await prisma.terraqoUsageBucket.deleteMany({where:{ownerKey:`user:${user.id}`}});
    await prisma.verificationToken.deleteMany({where:{identifier:{in:[`portal-session:${workspace.id}:${user.id}`,`portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where:{id:user.id}});
    console.log("CLEANUP: only own synthetic blob, document, profile, user, quota, audits and sessions removed.");
  }
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:"Cleanup verification failed; private diagnostics suppressed.");process.exitCode=1;}).finally(()=>prisma.$disconnect());
