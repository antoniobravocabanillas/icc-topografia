import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {prisma} from "../lib/prisma";
import {createWorkspacePortalToken} from "../lib/server/workspace-portal-session";
import {quotePdfScope} from "../lib/server/quote-pdf-access";
async function main() {
  process.env.AUTH_SECRET=randomBytes(32).toString("hex");
  const original={quote:prisma.quote.findFirst,module:prisma.terraqoWorkspaceModule.findUnique,billing:prisma.terraqoBillingAccount.findUnique,
    member:prisma.terraqoWorkspaceMember.findFirst,account:prisma.clientAccount.findFirst};
  let enabled=true,active=true,account=true;
  prisma.terraqoBillingAccount.findUnique=(async()=>null) as unknown as typeof original.billing;
  prisma.terraqoWorkspaceModule.findUnique=(async()=>({active:enabled})) as unknown as typeof original.module;
  prisma.terraqoWorkspaceMember.findFirst=(async()=>active?{role:"ADMIN"}:null) as unknown as typeof original.member;
  prisma.quote.findFirst=(async(args:{where:Record<string,unknown>})=>{
    assert.equal(args.where.id,"quote");assert.equal(args.where.publicToken,"a".repeat(64));assert.equal(args.where.deletedAt,null);
    assert.deepEqual(args.where.status,{not:"DRAFT"});assert.deepEqual(args.where.terraqoWorkspace,{active:true,deletedAt:null});
    return {terraqoWorkspaceId:"workspace"};
  }) as unknown as typeof original.quote;
  prisma.clientAccount.findFirst=(async(args:{where:Record<string,unknown>})=>{
    assert.equal(args.where.userId,"user");assert.equal(args.where.terraqoWorkspaceId,"workspace");assert.equal(args.where.deletedAt,null);
    assert.deepEqual(args.where.status,{in:["active","approved"]});assert.deepEqual(args.where.client,{terraqoWorkspaceId:"workspace",deletedAt:null});return account?{clientId:"owned-client"}:null;
  }) as unknown as typeof original.account;
  const request=(query="",bearer?:string)=>new Request(`https://example.test/quote/pdf${query}`,{headers:bearer?{authorization:`Bearer ${bearer}`}:{}});
  try {
    assert.equal(await quotePdfScope(request(),"quote",async()=>null),null,"Knowing the ID is insufficient.");
    assert.equal(await quotePdfScope(request("?token=bad"),"quote"),null);
    assert.equal(await quotePdfScope(request("?token="+"a".repeat(64)),"../quote"),null);
    assert.deepEqual(await quotePdfScope(request("?token="+"a".repeat(64)),"quote"),{terraqoWorkspaceId:"workspace",publicToken:"a".repeat(64),status:{not:"DRAFT"}});
    enabled=false;assert.equal(await quotePdfScope(request("?token="+"a".repeat(64)),"quote"),null);enabled=true;
    for (const role of ["ADMIN","CLIENT","PROFESSIONAL","MEMBER","VIEWER"] as const) {
      prisma.terraqoWorkspaceMember.findFirst=(async()=>active?{role}:null) as unknown as typeof original.member;
      const token=createWorkspacePortalToken({sub:"user",workspaceId:"workspace",workspaceSlug:"fixture",role}).token;
      const result=await quotePdfScope(request("?workspace=fixture",token),"quote");
      if(role==="ADMIN")assert.deepEqual(result,{terraqoWorkspaceId:"workspace"});
      else if(role==="CLIENT") {assert.deepEqual(result,{terraqoWorkspaceId:"workspace",clientId:"owned-client",status:{not:"DRAFT"}});account=false;assert.equal(await quotePdfScope(request("?workspace=fixture",token),"quote"),null);account=true;}
      else assert.equal(result,null);
      assert.equal(await quotePdfScope(request("?workspace=foreign",token),"quote"),null);
      active=false;assert.equal(await quotePdfScope(request("?workspace=fixture",token),"quote"),null);active=true;
    }
    console.log("PASS quote PDF authorization: ID alone denied, current private token scope, drafts/removed tenants excluded, CRM gate, admin/client ownership, foreign scope and inactive membership rejected.");
  }finally {prisma.quote.findFirst=original.quote;prisma.terraqoWorkspaceModule.findUnique=original.module;prisma.terraqoBillingAccount.findUnique=original.billing;
    prisma.terraqoWorkspaceMember.findFirst=original.member;prisma.clientAccount.findFirst=original.account;await prisma.$disconnect();}
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
