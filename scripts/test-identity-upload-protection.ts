import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { uploadProfessionalDocuments } from "../lib/server/professional-document-upload";
async function main(){
  const original={profile:prisma.terraqoProfessionalProfile.findUnique,member:prisma.terraqoWorkspaceMember.findFirst,count:prisma.terraqoProfessionalDocument.count,tx:prisma.$transaction};
  let status="PENDING_DOCUMENTS",verified=false,flip=false,writes=0,deletes=0,reserved=0,released=0,created=0;
  const tx={ $queryRaw:async(query:Prisma.Sql)=>query.strings.join("").includes("ProfessionalProfile")?[{id:"profile",identityVerificationStatus:status}]:[{id:"member"}],
    terraqoProfessionalDocument:{count:async()=>verified?1:0,updateMany:async()=>({count:0}),create:async(args:{data:{type:string,fileName:string}})=>{created++;return{id:`document-${created}`,type:args.data.type,fileName:args.data.fileName,reviewStatus:"SUBMITTED"};}},
    terraqoProfessionalProfile:{update:async(args:{data:Record<string,unknown>})=>{assert.ok(!("cvUrl" in args.data));assert.equal(args.data.identityVerificationStatus,"UNDER_REVIEW");status="UNDER_REVIEW";}},
  } as unknown as Prisma.TransactionClient;
  prisma.terraqoProfessionalProfile.findUnique=(async()=>({id:"profile",identityVerificationStatus:status})) as unknown as typeof original.profile;
  prisma.terraqoWorkspaceMember.findFirst=(async()=>({id:"member"})) as typeof original.member;
  prisma.terraqoProfessionalDocument.count=(async(args:{where:{type:{in:string[]};reviewStatus:string}})=>{assert.deepEqual(args.where.type.in,["DNI_FRONT","DNI_BACK"]);assert.equal(args.where.reviewStatus,"VERIFIED");return verified?1:0;}) as unknown as typeof original.count;
  let queue:Promise<unknown>=Promise.resolve();prisma.$transaction=(async(callback:(client:Prisma.TransactionClient)=>Promise<unknown>)=>{const result=queue.then(()=>callback(tx));queue=result.catch(()=>undefined);return result;}) as unknown as typeof original.tx;
  let race=false,arrivals=0;let resume=()=>{};const barrier=new Promise<void>(resolve=>{resume=resolve;});
  const store={set:async()=>{writes++;if(flip)status="VERIFIED";if(race && ++arrivals<=2){if(arrivals===2)resume();await barrier;}},delete:async()=>{deletes++;},getWithMetadata:async()=>null};
  const reserve=async()=>{reserved++;return{release:async()=>{released++;}};};
  const request=()=>{const form=new FormData();form.set("purpose","identity");for(const key of ["dniFront","dniBack"])form.set(key,new File(["%PDF-1.7\n"],`${key}.pdf`,{type:"application/pdf"}));return new Request("https://example.test/documents",{method:"POST",body:form});};
  try{
    for(const protectedStatus of ["VERIFIED","UNDER_REVIEW","UNKNOWN"]){status=protectedStatus;assert.equal((await uploadProfessionalDocuments(request(),"owner","workspace",{store,reserve})).status,409);}assert.equal(writes,0);assert.equal(reserved,0);
    status="REJECTED";verified=true;assert.equal((await uploadProfessionalDocuments(request(),"owner","workspace",{store,reserve})).status,409);assert.equal(writes,0);verified=false;
    status="PENDING_DOCUMENTS";flip=true;assert.equal((await uploadProfessionalDocuments(request(),"owner","workspace",{store,reserve})).status,409);assert.equal(created,0);assert.equal(deletes,2);assert.equal(released,1);assert.equal(status,"VERIFIED");
    status="PENDING_DOCUMENTS";flip=false;race=true;const responses=await Promise.all([uploadProfessionalDocuments(request(),"owner","workspace",{store,reserve}),uploadProfessionalDocuments(request(),"owner","workspace",{store,reserve})]);assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);assert.equal(created,2);assert.equal(status,"UNDER_REVIEW");assert.equal(released,2);
    console.log("PASS identity protection: no native header bypass, fail-closed statuses, verified identity documents, state rechecked under profile lock, concurrent pair commits once and confirmed conflict compensates storage.");
  }finally{prisma.terraqoProfessionalProfile.findUnique=original.profile;prisma.terraqoWorkspaceMember.findFirst=original.member;prisma.terraqoProfessionalDocument.count=original.count;prisma.$transaction=original.tx;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
