import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { uploadProfessionalDocuments } from "../lib/server/professional-document-upload";
async function main() {
  const original={profile:prisma.terraqoProfessionalProfile.findUnique,member:prisma.terraqoWorkspaceMember.findFirst,tx:prisma.$transaction,audit:prisma.activityLog.create};
  let member=true, changed=false, failedDelete=false, reserved=0,released=0,stored=0,deleted=0,audits=0, pointer="old";
  const lockOrder:string[]=[];
  const rows=[{id:"verified",type:"CV",reviewStatus:"VERIFIED"},{id:"old",type:"CV",reviewStatus:"SUBMITTED"}];
  let marker:Record<string,unknown>|undefined;
  const tx={
    $queryRaw:async(query:Prisma.Sql)=>{const text=query.strings.join("");if(text.includes('ProfessionalProfile')){lockOrder.push("profile");return[{id:"profile"}];}lockOrder.push("member");return changed?[]:[{id:"member"}];},
    terraqoProfessionalDocument:{updateMany:async(args:{where:{reviewStatus:string}})=>{assert.equal(args.where.reviewStatus,"SUBMITTED");for(const row of rows)if(row.reviewStatus==="SUBMITTED")row.reviewStatus="REJECTED";},
      create:async()=>{const row={id:`new${rows.length}`,type:"CV",fileName:"cv.pdf",reviewStatus:"SUBMITTED"};rows.push(row);return row;}},
    terraqoProfessionalProfile:{update:async(args:{data:{cvUrl:string}})=>{pointer=args.data.cvUrl;}},
    activityLog:{create:async(args:{data:{metadata:unknown}})=>{assert.deepEqual(args.data.metadata,{source:"native-portal",type:"CV"});audits++;}},
  } as unknown as Prisma.TransactionClient;
  prisma.terraqoProfessionalProfile.findUnique=(async()=>({id:"profile",identityVerificationStatus:"VERIFIED"})) as unknown as typeof original.profile;
  prisma.terraqoWorkspaceMember.findFirst=(async()=>member?{id:"member"}:null) as typeof original.member;
  let queue:Promise<unknown>=Promise.resolve();
  prisma.$transaction=(async(callback:(client:Prisma.TransactionClient)=>Promise<unknown>)=>{const result=queue.then(()=>callback(tx));queue=result.catch(()=>undefined);return result;}) as unknown as typeof original.tx;
  prisma.activityLog.create=(async(args:{data:{metadata:Record<string,unknown>}})=>{marker=args.data.metadata;return{id:"cleanup"};}) as unknown as typeof original.audit;
  const store={set:async()=>{stored++;},delete:async()=>{deleted++;if(failedDelete)throw new Error("unavailable");},getWithMetadata:async()=>null};
  const reserve=async()=>{reserved++;return{release:async()=>{released++;}};};
  const request=(mime="application/pdf",content="%PDF-1.7\n")=>{const form=new FormData();form.set("purpose","cv");form.set("cvFile",new File([content],"cv.pdf",{type:mime}));return new Request("https://example.test/documents",{method:"POST",headers:{"x-terraqo-native-upload":"1"},body:form});};
  try {
    assert.equal((await uploadProfessionalDocuments(request(),"owner",undefined,{store,reserve})).status,422);
    assert.equal((await uploadProfessionalDocuments(request("image/png"),"owner","workspace",{store,reserve})).status,422);assert.equal(stored,0);
    assert.equal((await uploadProfessionalDocuments(request("application/pdf","<html>"),"owner","workspace",{store,reserve})).status,422);assert.equal(reserved,0);
    const response=await uploadProfessionalDocuments(request(),"owner","workspace",{store,reserve});assert.equal(response.status,200);assert.equal((await response.json()).data.documents[0].type,"CV");
    assert.deepEqual(lockOrder,["profile","member"]);assert.equal(rows[0].reviewStatus,"VERIFIED");assert.equal(rows[1].reviewStatus,"REJECTED");assert.equal(pointer,"/api/terraqo/professional-documents/new2");assert.equal(audits,1);
    await Promise.all([uploadProfessionalDocuments(request(),"owner","workspace",{store,reserve}),uploadProfessionalDocuments(request(),"owner","workspace",{store,reserve})]);
    assert.equal(rows.filter(row=>row.reviewStatus==="SUBMITTED").length,1);assert.equal(audits,3);
    member=false;assert.equal((await uploadProfessionalDocuments(request(),"owner","workspace",{store,reserve})).status,403);member=true;
    changed=true;assert.equal((await uploadProfessionalDocuments(request(),"owner","workspace",{store,reserve})).status,503);assert.equal(deleted,1);assert.equal(released,1);
    failedDelete=true;assert.equal((await uploadProfessionalDocuments(request(),"owner","workspace",{store,reserve})).status,503);assert.equal(released,1);assert.equal(marker?.storageCleanupState,"PENDING");assert.ok(String(marker?.storageCleanupKey).startsWith("professional-documents/profile/cv/"));
    console.log("PASS native CV upload: PDF signature, workspace, serialized replacement, verified preservation, active pointer, audit, revoked membership and compensation quota retention.");
  } finally {prisma.terraqoProfessionalProfile.findUnique=original.profile;prisma.terraqoWorkspaceMember.findFirst=original.member;prisma.$transaction=original.tx;prisma.activityLog.create=original.audit;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
