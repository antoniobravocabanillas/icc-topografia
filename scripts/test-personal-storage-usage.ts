import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import {personalRetainedStorageBytes,personalRetainedStorageUnits} from "../lib/terraqo/billing/personal-storage-usage";
async function main(){
  let evidenceSize:number|null=1_000_001;
  const seen:string[]=[];
  const db={
    terraqoProfessionalDocument:{aggregate:async(args:unknown)=>{assert.deepEqual(args,{where:{professionalProfile:{userId:"owner"}},_sum:{size:true}});seen.push("document");return{_sum:{size:100}};}},
    terraqoWorklogMedia:{aggregate:async(args:unknown)=>{assert.deepEqual(args,{where:{worklog:{authorId:"owner"}},_sum:{size:true}});seen.push("worklog");return{_sum:{size:null}};}},
    terraqoMessageAttachment:{aggregate:async(args:unknown)=>{assert.deepEqual(args,{where:{message:{senderId:"owner"}},_sum:{size:true}});seen.push("message");return{_sum:{size:200}};}},
    terraqoExperienceEvidence:{aggregate:async(args:unknown)=>{assert.deepEqual(args,{where:{experience:{professionalProfile:{userId:"owner"}}},_sum:{size:true}});seen.push("experience");return{_sum:{size:evidenceSize}};}},
  } as unknown as Prisma.TransactionClient;
  assert.equal(await personalRetainedStorageBytes(db,"owner"),1_000_301);assert.deepEqual(seen.sort(),["document","experience","message","worklog"]);
  assert.equal(await personalRetainedStorageUnits(db,"owner"),2);
  evidenceSize=null;assert.equal(await personalRetainedStorageBytes(db,"owner"),300);
  for(const size of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER]){evidenceSize=size;await assert.rejects(personalRetainedStorageBytes(db,"owner"),/total is invalid/);}
  await assert.rejects(personalRetainedStorageBytes(db,""),/owner is required/);
  console.log("PASS personal retained storage: four owner-scoped sources including experience evidence, shared decimal-MB floor, nullable sums and invalid/overflow totals rejected.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
