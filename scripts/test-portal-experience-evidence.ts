import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { listPortalExperienceEvidence, uploadPortalExperienceEvidence, PortalExperienceEvidenceError } from "../lib/server/portal-experience-evidence";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";
const token:WorkspacePortalToken={sub:"owner",workspaceId:"workspace",workspaceSlug:"fixture",role:"PROFESSIONAL",iat:0,exp:Math.floor(Date.now()/1000)+3600,jti:"a".repeat(36)};
const version="2026-10-07T08:00:00.000Z";
const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
const request=(key="a".repeat(32),name="fixture.png",revision=version)=>{const form=new FormData();form.set("file",new File([bytes],name,{type:"image/png"}));form.set("version",revision);form.set("operationKey",key);return new Request("https://example.invalid/upload",{method:"POST",body:form});};
type Row={id:string;experienceId:string;storageKey:string;fileName:string;contentType:string;size:number;createdAt:Date};
async function main(){
  const original=prisma.$transaction;
  let experience={id:"experience",professionalProfileId:"profile",updatedAt:new Date(version),verificationStatus:"NOT_REQUESTED",verifiedByTerraqo:false,workspaceId:null as string|null,projectId:null as string|null};
  let rows=new Map<string,Row>(),audits=new Map<string,unknown>(); const blobs=new Map<string,ArrayBuffer>();
  let used=0,reserves=0,writes=0,compensations=0,owner=true,member=true,moduleActive=true,workspace=true,grant=true,failAudit=false,failChange=false,failStore=false,failReserve=false,uncertain=false,failCleanup=false;
  let beforeSet:()=>Promise<void>=async()=>undefined;
  const locks:string[]=[];
  const tx={
    terraqoProfessionalProfile:{findUnique:async()=>owner?{id:"profile"}:null},
    $queryRaw:async(query:Prisma.Sql)=>{const sql=query.strings.join("");let table="";for(const name of ["ProfessionalProfile","ProfessionalExperience","WorkspaceMember","WorkspaceModule","BillingAccount","VerificationToken","Workspace"])if(sql.includes('"Terraqo'+name+'"') || sql.includes('"'+name+'"')){table=name;break;}locks.push(table);assert.ok(sql.includes(table==="ProfessionalProfile"||table==="ProfessionalExperience"?"FOR UPDATE":"FOR SHARE"));if(table==="BillingAccount")return[];if(table==="ProfessionalExperience")return query.values.includes("experience")&&owner?[{id:"experience"}]:[];if(table==="WorkspaceMember"&&!member ||table==="WorkspaceModule"&&!moduleActive ||table==="Workspace"&&!workspace ||table==="VerificationToken"&&!grant)return[];return[{id:"lock"}];},
    terraqoProfessionalExperience:{findFirstOrThrow:async()=>({...experience}),updateMany:async()=>{if(failChange)return{count:0};experience={...experience,updatedAt:new Date(Math.max(Date.now(),experience.updatedAt.getTime()+1))};return{count:1};}},
    terraqoExperienceEvidence:{findFirst:async(args:{where:{id:string}})=>rows.get(args.where.id)??null,findMany:async()=>[...rows.values()],count:async()=>rows.size,
      create:async(args:{data:Omit<Row,"createdAt">})=>{const row={...args.data,createdAt:new Date()};rows.set(row.id,row);return row;}},
    activityLog:{findFirst:async(args:{where:{entityId:string}})=>audits.has(args.where.entityId)?{metadata:audits.get(args.where.entityId)}:null,create:async(args:{data:{entityId:string;metadata:unknown}})=>{if(failAudit)throw new Error("Synthetic audit failure");audits.set(args.data.entityId,args.data.metadata);}},
  } as unknown as Prisma.TransactionClient;
  let queue:Promise<unknown>=Promise.resolve();
  prisma.$transaction=(async(callback:(db:Prisma.TransactionClient)=>Promise<unknown>)=>{const result=queue.then(async()=>{const snapshot={rows:new Map(rows),audits:new Map(audits),experience:{...experience}};let committed=false;try{const value=await callback(tx);committed=true;if(uncertain&&rows.size){uncertain=false;throw new Error("Synthetic lost commit response");}return value;}catch(error){if(!committed){rows=snapshot.rows;audits=snapshot.audits;experience=snapshot.experience;}throw error;}});queue=result.catch(()=>undefined);return result;}) as unknown as typeof original;
  const store={set:async(key:string,data:ArrayBuffer)=>{writes++;await beforeSet();if(failStore)throw new Error("Synthetic blob failure");blobs.set(key,data);},getWithMetadata:async()=>null,delete:async(key:string)=>{blobs.delete(key);}};
  const reserve=async()=>{if(failReserve)throw new Error("Synthetic quota failure");reserves++;used++;return{release:async()=>{throw new Error("Raw refund forbidden");}};};
  const compensate=async(_user:string,_workspace:string,_experience:string,file:{storageKey:string;size:number})=>{compensations++;if(failCleanup)throw new Error("Synthetic durable persistence failure");if([...rows.values()].some(row=>row.storageKey===file.storageKey))return "blocked";blobs.delete(file.storageKey);used--;return "completed";};
  const deps={store,reserve,compensate};
  const reset=()=>{experience={...experience,updatedAt:new Date(version),verificationStatus:"NOT_REQUESTED",verifiedByTerraqo:false,workspaceId:null,projectId:null};rows.clear();audits.clear();blobs.clear();used=reserves=writes=compensations=0;owner=member=moduleActive=workspace=grant=true;failAudit=failChange=failStore=failReserve=uncertain=failCleanup=false;beforeSet=async()=>undefined;locks.length=0;};
  const rejected=async(status:number)=>assert.rejects(uploadPortalExperienceEvidence(request(),token,"experience",deps),error=>error instanceof PortalExperienceEvidenceError&&error.status===status);
  try{
    reset();const saved=await uploadPortalExperienceEvidence(request(),token,"experience",deps);assert.equal(rows.size,1);assert.equal(audits.size,1);assert.equal(used,1);assert.equal(compensations,0);assert.equal(saved.record.name,"fixture.png");assert.ok(!JSON.stringify(saved).includes("storageKey"));assert.deepEqual(locks.slice(0,2),["ProfessionalProfile","ProfessionalExperience"]);
    const replay=await uploadPortalExperienceEvidence(request(),token,"experience",deps);assert.equal(replay.record.id,saved.record.id);assert.equal(reserves,1);assert.equal(writes,1);
    await assert.rejects(uploadPortalExperienceEvidence(request("a".repeat(32),"changed.png"),token,"experience",deps),error=>error instanceof PortalExperienceEvidenceError&&error.status===409);assert.equal(reserves,1);
    assert.equal((await listPortalExperienceEvidence(token,"experience","a".repeat(32))).record?.id,saved.record.id);assert.equal((await listPortalExperienceEvidence(token,"experience","b".repeat(32))).record,null);
    for(const status of ["REQUESTED","APPROVED","VERIFIED","PENDING","UNKNOWN"]){reset();experience.verificationStatus=status;await rejected(403);assert.equal(reserves,0);}
    for(const flag of ["verifiedByTerraqo","projectId","workspaceId"] as const){reset();if(flag==="verifiedByTerraqo")experience.verifiedByTerraqo=true;else experience[flag]="protected";await rejected(403);}
    reset();experience.updatedAt=new Date("2026-10-07T09:00:00.000Z");await rejected(409);assert.equal(writes,0);
    for(const flag of ["owner","member","module","workspace","grant"]){reset();if(flag==="owner")owner=false;if(flag==="member")member=false;if(flag==="module")moduleActive=false;if(flag==="workspace")workspace=false;if(flag==="grant")grant=false;await rejected(flag==="owner"?404:flag==="grant"?401:403);assert.equal(reserves,0);}
    reset();await assert.rejects(uploadPortalExperienceEvidence(request(),{...token,role:"ADMIN"},"experience",deps));assert.equal(writes,0);
    reset();for(let i=0;i<6;i++)rows.set(String(i),{id:String(i),experienceId:"experience",storageKey:`old-${i}`,fileName:"old.png",contentType:"image/png",size:8,createdAt:new Date()});await rejected(422);assert.equal(reserves,0);
    reset();let arrived=0,release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});beforeSet=async()=>{arrived++;if(arrived===2)release();await barrier;};const concurrent=await Promise.all([uploadPortalExperienceEvidence(request(),token,"experience",deps),uploadPortalExperienceEvidence(request(),token,"experience",deps)]);assert.equal(concurrent[0].record.id,concurrent[1].record.id);assert.equal(rows.size,1);assert.equal(audits.size,1);assert.equal(blobs.size,1);assert.equal(used,1);assert.equal(compensations,1);
    reset();failAudit=true;await assert.rejects(uploadPortalExperienceEvidence(request(),token,"experience",deps));assert.equal(rows.size,0);assert.equal(blobs.size,0);assert.equal(used,0);
    reset();failChange=true;await rejected(409);assert.equal(rows.size,0);assert.equal(used,0);
    reset();failStore=true;await assert.rejects(uploadPortalExperienceEvidence(request(),token,"experience",deps));assert.equal(used,0);
    reset();failReserve=true;await assert.rejects(uploadPortalExperienceEvidence(request(),token,"experience",deps));assert.equal(compensations,0);assert.equal(writes,0);
    reset();beforeSet=async()=>{member=false;};await rejected(403);assert.equal(rows.size,0);assert.equal(used,0);
    reset();uncertain=true;await assert.rejects(uploadPortalExperienceEvidence(request(),token,"experience",deps));assert.equal(rows.size,1);assert.equal(blobs.size,1);assert.equal(used,1);assert.equal(compensations,1);assert.ok((await uploadPortalExperienceEvidence(request(),token,"experience",deps)).record.id);assert.equal(writes,1);
    reset();failStore=failCleanup=true;await assert.rejects(uploadPortalExperienceEvidence(request(),token,"experience",deps));assert.equal(compensations,1);assert.equal(used,1);
    console.log("PASS owner experience evidence: locked ownership/access/module/grant, protected states/version/count, stable payload-bound replay, one record/audit/quota under race, atomic rollback, revoke during store, durable compensation and uncertain commit reference retained.");
  }finally{prisma.$transaction=original;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
