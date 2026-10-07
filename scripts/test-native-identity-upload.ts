import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { uploadProfessionalDocuments } from "../lib/server/professional-document-upload";

async function main() {
  const original = {profile:prisma.terraqoProfessionalProfile.findUnique, member:prisma.terraqoWorkspaceMember.findFirst, count:prisma.terraqoProfessionalDocument.count, tx:prisma.$transaction, audit:prisma.activityLog.create};
  let status="PENDING_DOCUMENTS", verified=false, member=true, revoked=false, flip=false, writes=0, reserves=0, refunds=0;
  const documents:Array<{id:string;type:string;fileName:string;reviewStatus:string}>=[];
  const audits:string[]=[];
  const markers:string[]=[];
  let racing=false, arrivals=0;
  let resume=()=>{};
  const barrier=new Promise<void>(resolve=>{resume=resolve;});
  const tx={
    $queryRaw:async(query:Prisma.Sql)=>query.strings.join("").includes("ProfessionalProfile") ? [{id:"profile",identityVerificationStatus:status}] : revoked?[]:[{id:"member"}],
    terraqoProfessionalDocument:{count:async()=>verified?1:0, updateMany:async()=>({count:0}), create:async(args:{data:{type:string;fileName:string}})=>{const row={id:`doc-${documents.length}`,type:args.data.type,fileName:args.data.fileName,reviewStatus:"SUBMITTED"};documents.push(row);return row;}},
    terraqoProfessionalProfile:{update:async(args:{data:Record<string,unknown>})=>{assert.deepEqual(Object.keys(args.data).sort(),["identitySubmittedAt","identityVerificationNote","identityVerificationStatus","identityVerifiedAt"]);assert.equal(args.data.identityVerificationStatus,"UNDER_REVIEW");status="UNDER_REVIEW";}},
    activityLog:{create:async(args:{data:{metadata:{type:string;source:string}}})=>{assert.equal(args.data.metadata.source,"native-portal");audits.push(args.data.metadata.type);}},
  } as unknown as Prisma.TransactionClient;
  prisma.terraqoProfessionalProfile.findUnique=(async()=>({id:"profile",identityVerificationStatus:status})) as unknown as typeof original.profile;
  prisma.terraqoWorkspaceMember.findFirst=(async()=>member?{id:"member"}:null) as typeof original.member;
  prisma.terraqoProfessionalDocument.count=(async()=>verified?1:0) as typeof original.count;
  let queue:Promise<unknown>=Promise.resolve();
  prisma.$transaction=(async(callback:(client:Prisma.TransactionClient)=>Promise<unknown>)=>{const result=queue.then(()=>callback(tx));queue=result.catch(()=>undefined);return result;}) as unknown as typeof original.tx;
  prisma.activityLog.create=(async(args:{data:{metadata:{storageCleanupKey:string}}})=>{markers.push(args.data.metadata.storageCleanupKey);return{id:`cleanup-${markers.length}`};}) as unknown as typeof original.audit;
  const store={set:async()=>{writes++;if(flip)status="VERIFIED";if(racing && ++arrivals<=2){if(arrivals===2)resume();await barrier;}},delete:async()=>{},getWithMetadata:async()=>null};
  const reserve=async()=>{reserves++;return{release:async()=>{throw new Error("Unfenced release is forbidden");}};};
  const recover=async()=>{refunds++;return "completed" as const;};
  const dependencies={store,reserve,recover};
  const form=()=>{const result=new FormData();result.set("purpose","identity");result.set("dniFront",new File(["%PDF-1.7\nSYNTHETIC FRONT"],"front.pdf",{type:"application/pdf"}));result.set("dniBack",new File(["%PDF-1.7\nSYNTHETIC BACK"],"back.pdf",{type:"application/pdf"}));return result;};
  const upload=(body=form(),workspace:string|undefined="workspace")=>uploadProfessionalDocuments(new Request("https://example.test/documents",{method:"POST",headers:{"x-terraqo-native-upload":"1"},body}),"owner",workspace,dependencies);
  try {
    assert.equal((await upload(form(),"")).status,422);
    const oversizedBody=new Request("https://example.test/documents",{method:"POST",headers:{"x-terraqo-native-upload":"1","content-type":"multipart/form-data; boundary=fixture","content-length":"1"},body:new Uint8Array(4*1024*1024+65536+1)});
    assert.equal((await uploadProfessionalDocuments(oversizedBody,"owner","workspace",dependencies)).status,413);
    assert.equal(reserves,0);assert.equal(writes,0);

    const missing=form();missing.delete("dniBack");assert.equal((await upload(missing)).status,422);
    const repeated=form();repeated.append("dniFront",repeated.get("dniFront")!);assert.equal((await upload(repeated)).status,422);
    const extra=form();extra.set("cvFile",new File(["other"],"other.pdf"));assert.equal((await upload(extra)).status,422);
    const duplicate=form();duplicate.set("dniBack",new File(["%PDF-1.7\nSYNTHETIC FRONT"],"different-name.pdf",{type:"application/pdf"}));assert.equal((await upload(duplicate)).status,422);
    const large=form();large.set("dniFront",new File([new Uint8Array(2*1024*1024+1)],"front.pdf",{type:"application/pdf"}));assert.equal((await upload(large)).status,413);
    const spoof=form();spoof.set("dniFront",new File(["<html>"],"front.pdf",{type:"application/pdf"}));assert.equal((await upload(spoof)).status,422);
    assert.equal(writes,0);assert.equal(reserves,0);
    const boundary=form();for(const [index,key] of ["dniFront","dniBack"].entries()){const bytes=new Uint8Array(2*1024*1024);bytes.set(new TextEncoder().encode("%PDF-1.7\nSYNTHETIC"));bytes[bytes.length-1]=index;boundary.set(key,new File([bytes],`${key}.pdf`,{type:"application/pdf"}));}
    assert.equal((await upload(boundary)).status,200);assert.equal(documents.length,2);assert.equal(reserves,2);
    status="PENDING_DOCUMENTS";documents.length=0;audits.length=0;reserves=0;writes=0;
    member=false;assert.equal((await upload()).status,403);member=true;
    for(const protectedStatus of ["VERIFIED","UNDER_REVIEW","UNKNOWN"]){status=protectedStatus;assert.equal((await upload()).status,409);}
    status="REJECTED";verified=true;assert.equal((await upload()).status,409);verified=false;
    status="PENDING_DOCUMENTS";flip=true;assert.equal((await upload()).status,409);assert.equal(documents.length,0);assert.equal(markers.length,2);assert.equal(refunds,2);flip=false;
    status="PENDING_DOCUMENTS";revoked=true;assert.equal((await upload()).status,503);assert.equal(documents.length,0);assert.equal(refunds,4);revoked=false;
    status="PENDING_DOCUMENTS";racing=true;
    const responses=await Promise.all([upload(),upload()]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const result=await responses.find(r=>r.status===200)!.json();assert.equal(result.data.identityVerificationStatus,"UNDER_REVIEW");
    assert.deepEqual(result.data.documents.map((d:{type:string})=>d.type),["DNI_FRONT","DNI_BACK"]);
    assert.equal(documents.length,2);assert.deepEqual(audits,["DNI_FRONT","DNI_BACK"]);assert.equal(reserves,8);assert.equal(refunds,6);
    const before=reserves;assert.equal((await upload()).status,409);assert.equal(reserves,before);
    console.log("PASS native identity: strict joint pair, 2 MiB per face, duplicate bytes rejected, signatures, protected states, two audits, concurrent submission commits once, revocation and fenced per-file compensation.");
  } finally {prisma.terraqoProfessionalProfile.findUnique=original.profile;prisma.terraqoWorkspaceMember.findFirst=original.member;prisma.terraqoProfessionalDocument.count=original.count;prisma.$transaction=original.tx;prisma.activityLog.create=original.audit;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
