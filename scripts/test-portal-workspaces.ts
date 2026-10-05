import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { listPortalWorkspaces, switchPortalWorkspace } from '../lib/server/portal-workspaces';
import { verifyWorkspacePortalToken, type WorkspacePortalToken } from '../lib/server/workspace-portal-session';

async function main() {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  const original = { list: prisma.terraqoWorkspaceMember.findMany, transaction: prisma.$transaction };
  const token: WorkspacePortalToken = { sub:'self',workspaceId:'source',workspaceSlug:'source-company',role:'ADMIN',
    jti:'12345678-1234-1234-1234-123456789012',iat:1,exp:9999999999 };
  let attempts=0, targetActive=true, sourceActive=true, grant=true;
  const issued: string[]=[];
  prisma.terraqoWorkspaceMember.findMany = (async (args: Record<string,unknown>) => {
    assert.deepEqual(args.where,{userId:'self',active:true,workspace:{active:true,deletedAt:null},id:{gt:'cursor'}});
    assert.equal(args.take,31);
    return Array.from({length:31},(_,i)=>({id:`row-${i}`,role:'VIEWER',workspace:{slug:`company-${i}`,name:'Company',brandName:null}}));
  }) as unknown as typeof original.list;
  const tx = {
    $queryRaw: async () => [],
    verificationToken: {
      deleteMany: async () => ({count:0}), count: async () => attempts,
      findFirst: async () => grant ? {token:'hash'} : null,
      create: async ({data}: {data:{identifier:string;token:string}}) => {
        assert.match(data.token,/^[a-f0-9]{64}$/);
        if(data.identifier.startsWith('portal-switch-attempt:')) attempts++; else issued.push(data.identifier);
        return data;
      },
    },
    terraqoWorkspaceMember: { findFirst: async ({where}: {where:{userId:string;workspaceId?:string;workspace:{slug?:string}}}) => {
      assert.equal(where.userId,'self');
      return where.workspaceId ? sourceActive ? {role:'OWNER'} : null
        : targetActive && where.workspace.slug==='other-company' ? {role:'VIEWER',workspaceId:'target'} : null;
    } },
  };
  prisma.$transaction = (async (run: (client: typeof tx)=>Promise<unknown>)=>run(tx)) as unknown as typeof original.transaction;
  try {
    const page=await listPortalWorkspaces(token,'cursor');
    assert.equal(page.workspaces.length,30);assert.equal(page.nextCursor,'row-29');
    assert.deepEqual(Object.keys(page.workspaces[0]).sort(),['current','name','role','slug']);
    const result=await switchPortalWorkspace(token,'other-company');
    const decoded=verifyWorkspacePortalToken(result.token,'other-company');
    assert.equal(decoded?.role,'VIEWER');assert.equal(decoded.sub,'self');assert.equal(decoded.workspaceId,'target');
    assert.equal(verifyWorkspacePortalToken(result.token,'source-company'),null);
    assert.deepEqual(issued,['portal-session:target:self']);
    const rejected=async(status:number)=>assert.rejects(()=>switchPortalWorkspace(token,'other-company'),{status});
    targetActive=false;await rejected(403);assert.equal(attempts,2);
    targetActive=true;sourceActive=false;await rejected(401);sourceActive=true;
    grant=false;await rejected(401);grant=true;
    await assert.rejects(()=>switchPortalWorkspace({...token,jti:undefined},'other-company'),{status:401});
    attempts=30;await rejected(429);assert.equal(issued.length,1);
    console.log('PASS workspace selection: self-only bounded DTO, target role, tenant-bound grant, inactive source/target, revoked/legacy session and issuance limit.');
  } finally {
    prisma.terraqoWorkspaceMember.findMany=original.list;prisma.$transaction=original.transaction;await prisma.$disconnect();
  }
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
