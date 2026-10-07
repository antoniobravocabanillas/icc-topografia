import assert from "node:assert/strict";
import type {Role} from "@prisma/client";
import {prisma} from "../lib/prisma";
import {currentWebSessionRole} from "../lib/server/web-session-role";
async function main() {
  const original=prisma.user.findUnique;
  let role:Role|null="SUPER_ADMIN",reads=0;
  prisma.user.findUnique=(async(args:{where:{id:string};select:{role:boolean}})=>{
    assert.equal(args.where.id,"synthetic-account");assert.deepEqual(args.select,{role:true});reads++;
    return role ? {role} : null;
  }) as unknown as typeof original;
  try {
    assert.equal(await currentWebSessionRole("synthetic-account"),"SUPER_ADMIN");
    role="CUSTOMER";assert.equal(await currentWebSessionRole("synthetic-account"),"CUSTOMER");assert.equal(reads,2);
    role=null;assert.equal(await currentWebSessionRole("synthetic-account"),null);
    assert.equal(await currentWebSessionRole(undefined),null);assert.equal(reads,3);
    console.log("PASS web role authority: each session reads the current role, demotion is immediate and deleted/empty identities fail closed.");
  } finally {prisma.user.findUnique=original;await prisma.$disconnect();}
}
main().catch(()=>{console.error("Web role verification failed; private diagnostics suppressed.");process.exitCode=1;});
