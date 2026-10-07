import assert from "node:assert/strict";
import type {Prisma} from "@prisma/client";
import {prisma} from "../lib/prisma";
import {recoverExperienceEvidenceCleanup,compensateExperienceEvidenceUpload} from "../lib/server/experience-evidence-cleanup";
async function main(){
  const original={audit:prisma.activityLog.findFirst,experience:prisma.terraqoProfessionalExperience.findFirst,tx:prisma.$transaction,update:prisma.activityLog.updateMany,create:prisma.activityLog.create};
  const reset=()=>({source:"native-portal",storageCleanupState:"PENDING",storageCleanupKey:"experience-evidence/experience/random-fixture.pdf",storageCleanupBytes:100,storageCleanupExperienceId:"experience"});
  let metadata:Record<string,unknown>=reset(), actor:string|null="owner",owned=true,retained=false,fail=false,profileLive=true,deletes=0,refunds=0;
  const locks:string[]=[];
  prisma.activityLog.findFirst=(async()=>({id:"audit",actorId:actor,metadata})) as unknown as typeof original.audit;
  prisma.terraqoProfessionalExperience.findFirst=(async(args:unknown)=>{assert.deepEqual(args,{where:{id:"experience",professionalProfile:{userId:"owner"}},select:{professionalProfileId:true}});return owned?{professionalProfileId:"profile"}:null;}) as unknown as typeof original.experience;
  prisma.activityLog.updateMany=(async(args:{where:{metadata:{equals:unknown}};data:{metadata:Record<string,unknown>}})=>{assert.deepEqual(args.where.metadata.equals,metadata);metadata=args.data.metadata;return{count:1};}) as unknown as typeof original.update;
  const tx={
    $queryRaw:async(query:Prisma.Sql)=>{const sql=query.strings.join("");const table=sql.includes('ProfessionalProfile')?'profile':sql.includes('ProfessionalExperience')?'experience':'audit';locks.push(table);assert.ok(sql.includes('FOR UPDATE'));return profileLive?[{id:table}]:[];},
    activityLog:{findUnique:async()=>({metadata}),update:async(args:{data:{metadata:Record<string,unknown>}})=>{metadata=args.data.metadata;}},
    terraqoExperienceEvidence:{count:async(args:unknown)=>{assert.deepEqual(args,{where:{storageKey:"experience-evidence/experience/random-fixture.pdf"}});return retained?1:0;},aggregate:async()=>({_sum:{size:2_000_000}})},
    terraqoProfessionalDocument:{aggregate:async()=>({_sum:{size:0}})},terraqoWorklogMedia:{aggregate:async()=>({_sum:{size:0}})},terraqoMessageAttachment:{aggregate:async()=>({_sum:{size:0}})},
    terraqoUsageBucket:{updateMany:async(args:{where:{used:{gte:number}};data:unknown})=>{assert.equal(args.where.used.gte,3);assert.deepEqual(args.data,{used:{decrement:1}});refunds++;return{count:1};}},
  } as unknown as Prisma.TransactionClient;
  let queue:Promise<unknown>=Promise.resolve();prisma.$transaction=(async(callback:(tx:Prisma.TransactionClient)=>Promise<unknown>)=>{const result=queue.then(()=>callback(tx));queue=result.catch(()=>undefined);return result;}) as unknown as typeof original.tx;
  const store={delete:async()=>{assert.deepEqual(locks.slice(-3),["profile","experience","audit"]);deletes++;if(fail)throw new Error("Synthetic failure");}};
  try{
    actor=null;assert.equal(await recoverExperienceEvidenceCleanup("audit",store),"skipped");actor="owner";
    for(const key of ["professional-documents/profile/f.pdf","experience-evidence/foreign/f.pdf","experience-evidence/experience/../f.pdf"]){metadata.storageCleanupKey=key;assert.equal(await recoverExperienceEvidenceCleanup("audit",store),"blocked");}metadata=reset();
    metadata.storageCleanupBytes=8*1024*1024+1;assert.equal(await recoverExperienceEvidenceCleanup("audit",store),"blocked");metadata=reset();
    owned=false;assert.equal(await recoverExperienceEvidenceCleanup("audit",store),"blocked");owned=true;
    profileLive=false;assert.equal(await recoverExperienceEvidenceCleanup("audit",store),"blocked");profileLive=true;
    retained=true;assert.equal(await recoverExperienceEvidenceCleanup("audit",store),"blocked");assert.equal(deletes,0);retained=false;
    fail=true;assert.equal(await recoverExperienceEvidenceCleanup("audit",store),"retry");assert.equal(refunds,0);assert.equal(metadata.storageCleanupState,"PENDING");assert.equal(metadata.storageCleanupAttempts,1);fail=false;
    assert.equal(await recoverExperienceEvidenceCleanup("audit",store),"completed");assert.equal(refunds,1);assert.equal(metadata.storageCleanupKey,undefined);assert.equal(await recoverExperienceEvidenceCleanup("audit",store),"skipped");
    metadata=reset();const results=await Promise.all([recoverExperienceEvidenceCleanup("audit",store),recoverExperienceEvidenceCleanup("audit",store)]);assert.deepEqual(results.sort(),["completed","skipped"]);assert.equal(refunds,2);
    metadata=reset();const before=deletes;prisma.activityLog.create=(async()=>{throw new Error("Synthetic persistence failure");}) as unknown as typeof original.create;
    await assert.rejects(compensateExperienceEvidenceUpload("owner","workspace","experience",{storageKey:String(metadata.storageCleanupKey),size:100},store));assert.equal(deletes,before);
    console.log("PASS experience cleanup: owner/prefix/size guards, profile-experience-audit lock order, live-reference protection, retry retention, floor including live evidence, one refund under concurrency and no deletion before durable persistence.");
  }finally{prisma.activityLog.findFirst=original.audit;prisma.terraqoProfessionalExperience.findFirst=original.experience;prisma.$transaction=original.tx;prisma.activityLog.updateMany=original.update;prisma.activityLog.create=original.create;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
