import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import {personalRetainedStorageBytes,personalRetainedStorageUnits} from "../lib/terraqo/billing/personal-storage-usage";
async function main(){
  let evidenceSize:number|null=1_000_001;
  let educationSize:number|null=600_000, reserved:number|null=3;
  const seen:string[]=[];
  const db={
    terraqoProfessionalDocument:{aggregate:async(args:unknown)=>{assert.deepEqual(args,{where:{professionalProfile:{userId:"owner"}},_sum:{size:true}});seen.push("document");return{_sum:{size:100}};}},
    terraqoWorklogMedia:{aggregate:async(args:unknown)=>{assert.deepEqual(args,{where:{worklog:{authorId:"owner"}},_sum:{size:true}});seen.push("worklog");return{_sum:{size:null}};}},
    terraqoMessageAttachment:{aggregate:async(args:unknown)=>{assert.deepEqual(args,{where:{message:{senderId:"owner"}},_sum:{size:true}});seen.push("message");return{_sum:{size:200}};}},
    terraqoExperienceEvidence:{aggregate:async(args:unknown)=>{assert.deepEqual(args,{where:{experience:{professionalProfile:{userId:"owner"}}},_sum:{size:true}});seen.push("experience");return{_sum:{size:evidenceSize}};}},
    terraqoEducationEvidence:{aggregate:async(args:unknown)=>{assert.deepEqual(args,{where:{education:{professionalProfile:{userId:"owner"}}},_sum:{size:true}});seen.push("education");return{_sum:{size:educationSize}};}},
    terraqoEducationEvidenceAttempt:{aggregate:async(args:unknown)=>{assert.deepEqual(args,{where:{education:{professionalProfile:{userId:"owner"}},state:{in:["RESERVED","CLEANUP_PENDING","QUARANTINED"]}},_sum:{reservedUnits:true}});return{_sum:{reservedUnits:reserved}};}},
  } as unknown as Prisma.TransactionClient;
  assert.equal(await personalRetainedStorageBytes(db,"owner"),1_600_301);assert.deepEqual(seen.sort(),["document","education","experience","message","worklog"]);
  assert.equal(await personalRetainedStorageUnits(db,"owner"),5);
  evidenceSize=null;educationSize=null;reserved=null;assert.equal(await personalRetainedStorageBytes(db,"owner"),300);
  assert.equal(await personalRetainedStorageUnits(db,"owner"),1);
  for(const size of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER]){evidenceSize=size;await assert.rejects(personalRetainedStorageBytes(db,"owner"),/total is invalid/);}
  await assert.rejects(personalRetainedStorageBytes(db,""),/owner is required/);
  evidenceSize=0;
  for(const value of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER]){reserved=value;await assert.rejects(personalRetainedStorageUnits(db,"owner"),/reserve total is invalid/);}
  console.log("PASS shared storage: five owner-scoped retained sources, separate outstanding education units, no COMMITTED/tombstone double charge, nullable sums and unsafe totals rejected.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
