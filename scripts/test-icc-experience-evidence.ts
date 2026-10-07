import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {getStore} from "@netlify/blobs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {prisma} from "../lib/prisma";
import {createRevocablePortalToken} from "../lib/server/workspace-portal-session";
import {WORKLOG_EVIDENCE_STORE,createExperienceEvidenceKey} from "../lib/server/media";
let phase="setup";
async function main(){
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,"icc-topografia:20616116313");
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:"icc-topografia",active:true,deletedAt:null,companies:{some:{document:"20616116313",deletedAt:null}},modules:{some:{code:"PROFESSIONAL_NETWORK",active:true}}},select:{id:true}});
  const helpers=await import(pathToFileURL(join(process.env.APPDATA!,"npm/node_modules/netlify-cli/dist/utils/command-helpers.js")).href);const [token]=await helpers.getToken();assert.ok(token);
  const store=getStore({name:WORKLOG_EVIDENCE_STORE,siteID:"2d38524a-44f9-4473-8a1f-9270e03bc2bf",token,consistency:"strong"});
  const users:string[]=[];const experiences:string[]=[];
  const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGMsAAAAASUVORK5CYII=","base64");
  const base="https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/";
  try{
    const identities=[];
    for(let i=0;i<2;i++){
      const user=await prisma.user.create({data:{email:`experience-${randomUUID()}@example.test`,name:"Prueba evidencia privada",role:"CUSTOMER",emailVerified:new Date(),terraqoMemberships:{create:{workspaceId:workspace.id,role:"PROFESSIONAL",active:true}},terraqoProfessionalProfile:{create:{}}},select:{id:true,terraqoProfessionalProfile:{select:{id:true}}}});users.push(user.id);
      const access=await createRevocablePortalToken({sub:user.id,workspaceId:workspace.id,workspaceSlug:"icc-topografia",role:"PROFESSIONAL"});identities.push({user,token:access.token});
    }
    const owner=identities[0],foreign=identities[1];
    const exp=await prisma.terraqoProfessionalExperience.create({data:{professionalProfileId:owner.user.terraqoProfessionalProfile!.id,title:"Fixture evidencia Android",visibility:"PRIVATE"}});experiences.push(exp.id);
    const endpoint=(id:string)=>`experiences/${id}/evidence`;
    const request=(path:string,body?:FormData,bearer=owner.token)=>fetch(base+path,{method:body?"POST":"GET",body,headers:bearer?{authorization:`Bearer ${bearer}`}:{},redirect:"error",signal:AbortSignal.timeout(90000)});
    const payload=(version:string,key:string,name="fixture.png")=>{const form=new FormData();form.set("file",new File([bytes],name,{type:"image/png"}));form.set("version",version);form.set("operationKey",key);return form;};
    const key=randomBytes(16).toString("hex");
    phase="anonymous/foreign";assert.equal((await request(endpoint(exp.id),undefined,"")).status,401);assert.equal((await request(endpoint(exp.id),undefined,foreign.token)).status,404);assert.equal((await request(endpoint(exp.id),payload(exp.updatedAt.toISOString(),key),foreign.token)).status,404);
    phase="concurrent replay";const concurrent=await Promise.all([request(endpoint(exp.id),payload(exp.updatedAt.toISOString(),key)),request(endpoint(exp.id),payload(exp.updatedAt.toISOString(),key))]);assert.deepEqual(concurrent.map(r=>r.status),[200,200]);const confirmed=await Promise.all(concurrent.map(r=>r.json()));assert.equal(confirmed[0].data.record.id,confirmed[1].data.record.id);assert.ok(!JSON.stringify(confirmed).includes("storageKey"));assert.ok(!JSON.stringify(confirmed).includes(owner.user.id));
    const row=await prisma.terraqoExperienceEvidence.findFirstOrThrow({where:{experienceId:exp.id}});assert.equal(await prisma.terraqoExperienceEvidence.count({where:{experienceId:exp.id}}),1);assert.deepEqual(Buffer.from((await store.getWithMetadata(row.storageKey,{type:"arrayBuffer"}))!.data),bytes);
    assert.equal(await prisma.activityLog.count({where:{actorId:owner.user.id,entityType:"ExperienceEvidence",action:"CREATED",entityId:row.id}}),1);
    assert.equal((await prisma.terraqoUsageBucket.findFirstOrThrow({where:{ownerKey:`user:${owner.user.id}`,metric:"storage-mb",period:"retained"}})).used,1);
    phase="download/reconcile";const download=await request(endpoint(exp.id)+`/${row.id}`);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);assert.deepEqual(download.headers.get("cache-control")?.split(",").map(value=>value.trim()),["private","no-store"]);assert.equal((await request(endpoint(exp.id)+`/${row.id}`,undefined,foreign.token)).status,404);assert.equal((await request(endpoint(exp.id)+`/${row.id}`,undefined,"")).status,401);
    assert.equal((await (await request(endpoint(exp.id)+`?operationKey=${key}`)).json()).data.record.id,row.id);
    assert.equal((await request(endpoint(exp.id),payload(exp.updatedAt.toISOString(),key,"different.png"))).status,409);
    assert.equal((await request(endpoint(exp.id),payload(exp.updatedAt.toISOString(),randomBytes(16).toString("hex")))).status,409);
    for(const status of ["REQUESTED","APPROVED"] as const){phase=`protected ${status}`;const changed=await prisma.terraqoProfessionalExperience.update({where:{id:exp.id},data:{verificationStatus:status}});assert.equal((await request(endpoint(exp.id),payload(changed.updatedAt.toISOString(),randomBytes(16).toString("hex")))).status,403);}
    phase="protected workspace";const linked=await prisma.terraqoProfessionalExperience.update({where:{id:exp.id},data:{verificationStatus:"NOT_REQUESTED",workspaceId:workspace.id}});assert.equal((await request(endpoint(exp.id),payload(linked.updatedAt.toISOString(),randomBytes(16).toString("hex")))).status,403);
    phase="distinct operations/version race";const race=await prisma.terraqoProfessionalExperience.create({data:{professionalProfileId:owner.user.terraqoProfessionalProfile!.id,title:"Fixture carrera evidencia",visibility:"PRIVATE"}});experiences.push(race.id);
    const competing=await Promise.all([request(endpoint(race.id),payload(race.updatedAt.toISOString(),randomBytes(16).toString("hex"))),request(endpoint(race.id),payload(race.updatedAt.toISOString(),randomBytes(16).toString("hex")))]);assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);assert.equal(await prisma.terraqoExperienceEvidence.count({where:{experienceId:race.id}}),1);
    assert.equal((await prisma.terraqoUsageBucket.findFirstOrThrow({where:{ownerKey:`user:${owner.user.id}`,metric:"storage-mb",period:"retained"}})).used,2);
    phase="file count";const capped=await prisma.terraqoProfessionalExperience.create({data:{professionalProfileId:owner.user.terraqoProfessionalProfile!.id,title:"Fixture seis archivos"}});experiences.push(capped.id);
    await prisma.terraqoExperienceEvidence.createMany({data:Array.from({length:6},(_,index)=>({experienceId:capped.id,uploadedById:owner.user.id,storageKey:createExperienceEvidenceKey(capped.id,`fixture-${index}.png`),fileName:`fixture-${index}.png`,contentType:"image/png",size:bytes.length}))});
    assert.equal((await request(endpoint(capped.id),payload(capped.updatedAt.toISOString(),randomBytes(16).toString("hex")))).status,422);assert.equal((await (await request(endpoint(capped.id))).json()).data.canUpload,false);
    phase="membership revoked";await prisma.terraqoWorkspaceMember.updateMany({where:{userId:owner.user.id,workspaceId:workspace.id},data:{active:false}});assert.equal((await request(endpoint(exp.id))).status,401);assert.equal((await request(endpoint(exp.id)+`/${row.id}`)).status,401);
    const profile=await prisma.terraqoProfessionalProfile.findUniqueOrThrow({where:{id:owner.user.terraqoProfessionalProfile!.id}});assert.equal(profile.liveCvEnabled,false);assert.equal(profile.bankAccountNumber,null);
    console.log("PASS deployed owner experience evidence: private bytes/list/download, foreign/anonymous isolation, payload-bound concurrent replay with one quota/audit, stale version and protected review/workspace rejected, six-file ceiling, distinct-operation race and membership revocation.");
  }finally{
    // Only prefixes of experiences created by this fixture are eligible. This
    // also removes its compensated attempts after an uncertain HTTP response.
    for(const id of experiences){const listing=await store.list({prefix:`experience-evidence/${id}/`});for(const blob of listing.blobs)await store.delete(blob.key);}
    for(const id of users){await prisma.activityLog.deleteMany({where:{actorId:id,terraqoWorkspaceId:workspace.id,entityType:"ExperienceEvidence"}});await prisma.terraqoUsageBucket.deleteMany({where:{ownerKey:`user:${id}`}});await prisma.verificationToken.deleteMany({where:{identifier:`portal-session:${workspace.id}:${id}`}});await prisma.user.delete({where:{id}});}
    console.log("CLEANUP: exclusively this fixture's experiences, evidence blobs, users, audits, quota and session grants removed.");
  }
}
main().catch(error=>{console.error(`Experience fixture phase: ${phase}`);console.error(error instanceof assert.AssertionError?error.message:"Private diagnostics suppressed.");process.exitCode=1;}).finally(()=>prisma.$disconnect());
