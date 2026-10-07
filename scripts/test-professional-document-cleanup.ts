import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { recoverProfessionalDocumentCleanup, recoverProfessionalDocumentCleanups, cleanupRetrySchedule } from "../lib/server/professional-document-cleanup";
async function main() {
  const original={audit:prisma.activityLog.findFirst,profile:prisma.terraqoProfessionalProfile.findUnique,count:prisma.terraqoProfessionalDocument.count,tx:prisma.$transaction, update:prisma.activityLog.updateMany, query:prisma.$queryRaw};
  let metadata: Record<string,unknown>={source:"native-portal",type:"OTHER",storageCleanupState:"PENDING",storageCleanupKey:"professional-documents/profile/other/private.png",storageCleanupBytes:100};
  let retained=false, actor: string|null="owner", refunds=0, deletions=0, fail=false;
  prisma.activityLog.updateMany=(async(args:{data:{metadata:Record<string,unknown>}})=>{metadata=args.data.metadata;return{count:1};}) as unknown as typeof original.update;
  prisma.$queryRaw=(async(query:Prisma.Sql)=>{assert.ok(query.strings.join('').includes("LIMIT 5"));assert.ok(query.values.some(value=>typeof value==="string"&&value.includes("2026")));return[{id:"audit"}];}) as unknown as typeof original.query;
  const tx={
    $queryRaw:async(query:Prisma.Sql)=>{assert.ok(query.values.includes("audit")&&query.values.includes("owner"));return[{id:"audit"}];},
    activityLog:{findUnique:async()=>({metadata}),update:async(args:{data:{metadata:Record<string,unknown>}})=>{metadata=args.data.metadata;}},
    terraqoProfessionalDocument:{aggregate:async()=>({_sum:{size:1_200_000}})},
    terraqoWorklogMedia:{aggregate:async()=>({_sum:{size:0}})},terraqoMessageAttachment:{aggregate:async()=>({_sum:{size:0}})},
    terraqoUsageBucket:{updateMany:async(args:{where:{used:{gte:number}};data:unknown})=>{assert.equal(args.where.used.gte,3);assert.deepEqual(args.data,{used:{decrement:1}});refunds++;return{count:1};}},
  } as unknown as Prisma.TransactionClient;
  prisma.activityLog.findFirst=(async()=>({id:"audit",actorId:actor,metadata})) as unknown as typeof original.audit;
  prisma.terraqoProfessionalProfile.findUnique=(async()=>({id:"profile"})) as unknown as typeof original.profile;
  prisma.terraqoProfessionalDocument.count=(async()=>retained?1:0) as typeof original.count;
  let queue:Promise<unknown>=Promise.resolve();
  prisma.$transaction=(async(callback:(client:Prisma.TransactionClient)=>Promise<unknown>)=>{const result=queue.then(()=>callback(tx));queue=result.catch(()=>undefined);return result;}) as unknown as typeof original.tx;
  const store={delete:async()=>{deletions++;if(fail)throw new Error("unavailable");}};
  const reset=()=>{metadata={source:"native-portal",type:"OTHER",storageCleanupState:"PENDING",storageCleanupKey:"professional-documents/profile/other/private.png",storageCleanupBytes:100};};
  try {
    retained=true;assert.equal(await recoverProfessionalDocumentCleanup("audit",store),"blocked");assert.equal(deletions,0);retained=false;
    metadata.storageCleanupKey="professional-documents/other/other/private.png";assert.equal(await recoverProfessionalDocumentCleanup("audit",store),"blocked");reset();
    actor=null;assert.equal(await recoverProfessionalDocumentCleanup("audit",store),"skipped");actor="owner";
    const now=new Date("2026-10-07T00:00:00Z");
    assert.equal(cleanupRetrySchedule(undefined,now).storageCleanupNextAttemptAt,"2026-10-07T00:05:00.000Z");
    assert.equal(cleanupRetrySchedule(7,now).storageCleanupNextAttemptAt,"2026-10-07T06:00:00.000Z");
    assert.equal(cleanupRetrySchedule(-1,now).storageCleanupAttempts,1);
    retained=true;assert.equal((await recoverProfessionalDocumentCleanups(now)).blocked,1);assert.equal(metadata.storageCleanupState,"BLOCKED");retained=false;reset();
    fail=true;assert.equal(await recoverProfessionalDocumentCleanup("audit",store),"retry");assert.equal(refunds,0);assert.equal(metadata.storageCleanupState,"PENDING");assert.equal(metadata.storageCleanupAttempts,1);assert.ok(metadata.storageCleanupNextAttemptAt);fail=false;
    assert.equal(await recoverProfessionalDocumentCleanup("audit",store),"completed");assert.equal(refunds,1);assert.equal(metadata.storageCleanupKey,undefined);
    assert.equal(await recoverProfessionalDocumentCleanup("audit",store),"skipped");assert.equal(refunds,1);
    reset();const results=await Promise.all([recoverProfessionalDocumentCleanup("audit",store),recoverProfessionalDocumentCleanup("audit",store)]);
    assert.ok(results.includes("completed"));assert.ok(results.includes("skipped"));assert.equal(refunds,2);
    console.log("PASS cleanup recovery: key ownership, live-reference guard, removed actor, retry retention, quota floor and completion fence.");
  } finally {prisma.activityLog.findFirst=original.audit;prisma.terraqoProfessionalProfile.findUnique=original.profile;prisma.terraqoProfessionalDocument.count=original.count;prisma.$transaction=original.tx;prisma.activityLog.updateMany=original.update;prisma.$queryRaw=original.query;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
