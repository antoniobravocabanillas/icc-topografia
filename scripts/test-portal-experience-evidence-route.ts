import assert from "node:assert/strict";
import {prisma} from "../lib/prisma";
import {createWorkspacePortalToken} from "../lib/server/workspace-portal-session";
import {GET,POST} from "../app/api/public/workspaces/[workspaceSlug]/portal/experiences/[experienceId]/evidence/route";
import {GET as DOWNLOAD} from "../app/api/public/workspaces/[workspaceSlug]/portal/experiences/[experienceId]/evidence/[evidenceId]/route";
async function main(){
  const originals={membership:prisma.terraqoWorkspaceMember.findFirst,tx:prisma.$transaction,secret:process.env.AUTH_SECRET,log:console.error};
  let reads=0,logs=0;
  process.env.AUTH_SECRET="isolated-test-configuration";
  prisma.terraqoWorkspaceMember.findFirst=(async()=>({role:"PROFESSIONAL"})) as unknown as typeof originals.membership;
  prisma.$transaction=(async()=>{reads++;throw new Error("Synthetic sensitive provider diagnostics");}) as unknown as typeof originals.tx;
  console.error=()=>{logs++;};
  const bearer=createWorkspacePortalToken({sub:"owner",workspaceId:"workspace",workspaceSlug:"fixture",role:"PROFESSIONAL"}).token;
  const request=(authorized=true)=>new Request("https://example.invalid/evidence",{headers:authorized?{authorization:`Bearer ${bearer}`}:{}});
  const context={params:Promise.resolve({workspaceSlug:"fixture",experienceId:"experience"})};
  try{
    assert.equal((await GET(request(false),context)).status,401);assert.equal(reads,0);
    for(const route of [GET,POST]){const response=await route(request(),context);assert.equal(response.status,500);assert.ok(!(await response.text()).includes("provider diagnostics"));}
    const download=await DOWNLOAD(request(),{params:Promise.resolve({workspaceSlug:"fixture",experienceId:"experience",evidenceId:"evidence"})});assert.equal(download.status,500);assert.ok(!(await download.text()).includes("provider diagnostics"));assert.equal(logs,0);
    assert.equal((await GET(new Request("https://example.invalid/evidence?operationKey=invalid",{headers:{authorization:`Bearer ${bearer}`}}),context)).status,422);
    console.log("PASS experience routes: anonymous blocked before transactions, bounded operation lookup, generic provider failures reveal no diagnostic data or raw logs.");
  }finally{prisma.terraqoWorkspaceMember.findFirst=originals.membership;prisma.$transaction=originals.tx;console.error=originals.log;if(originals.secret===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=originals.secret;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
