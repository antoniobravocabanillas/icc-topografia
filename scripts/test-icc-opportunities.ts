import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {prisma} from '../lib/prisma';
import {listPortalResource,savePortalResource,PortalResourceError} from '../lib/server/portal-resources';
import {PortalOpportunityError} from '../lib/server/portal-opportunities';
import type {WorkspacePortalToken} from '../lib/server/workspace-portal-session';
type RecordDto={id:string;updatedAt:string;fields:Record<string,string>};
async function main(){
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,'icc-topografia:20616116313');
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:'icc-topografia',active:true,deletedAt:null,
    companies:{some:{document:'20616116313',deletedAt:null}}},select:{id:true}});
  const run=randomUUID(),companyId=`000-opportunity-company-${run}`,password=randomBytes(24).toString('hex'),email=`opportunities-${run}@example.test`;
  const user=await prisma.user.create({data:{email,name:'Prueba oportunidades',role:'CUSTOMER',emailVerified:new Date(),passwordHash:await bcrypt.hash(password,12),
    terraqoMemberships:{create:{workspaceId:workspace.id,role:'ADMIN',active:true}}},select:{id:true}});
  const token:WorkspacePortalToken={sub:user.id,workspaceId:workspace.id,workspaceSlug:'icc-topografia',role:'ADMIN',iat:1,exp:2};
  const http=process.env.TEST_OPPORTUNITIES_HTTP==='1';let bearer='';
  const base='https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal';
  const request=(path:string,body?:unknown,key?:string)=>fetch(`${base}/${path}`,{method:body?'POST':'GET',headers:{'content-type':'application/json',authorization:`Bearer ${bearer}`,...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000),redirect:'error'});
  const save=async(fields:Record<string,string>,key=randomBytes(16).toString('hex'),row?:RecordDto,status=200)=>{
    if(http){const response=await request('resources/opportunities',{fields,...(row?{id:row.id,version:row.updatedAt}:{})},key);assert.equal(response.status,status);return status===200?(await response.json()).data.record as RecordDto:null;}
    try{const result=await savePortalResource(token,'opportunities',fields,key,row?.id,row?.updatedAt);assert.equal(status,200);return result as RecordDto;}
    catch(error){const code=error instanceof PortalOpportunityError||error instanceof PortalResourceError?error.status:error instanceof z.ZodError?422:null;if(code===null)throw error;assert.equal(code,status);return null;}
  };
  try{
    await prisma.company.create({data:{id:companyId,terraqoWorkspaceId:workspace.id,legalName:'Empresa temporal de contactos'}});
    if(http){const login=await request('login',{email,password});assert.equal(login.status,200);bearer=(await login.json()).data.token;}
    else for(const role of ['MEMBER','CLIENT','PROFESSIONAL','VIEWER'] as const)
      for(const code of ['opportunities','contactCompanies'] as const)await assert.rejects(listPortalResource({...token,role},code),error=>error instanceof PortalResourceError&&error.status===403);
    const page=http?(await(await request('resources/contactCompanies')).json()).data:await listPortalResource(token,'contactCompanies');
    assert.ok(page.records.some((row:{id:string})=>row.id===companyId));
    for(const row of page.records) assert.deepEqual(Object.keys(row.fields),['title']);
    const fields={companyId,title:'Oportunidad temporal',interest:'Levantamiento de terreno',status:'OPEN',probability:'25',nextStep:'Coordinar visita',nextFollowUpAt:'2026-10-15',notes:'Alcance preliminar'};
    const key=randomBytes(16).toString('hex');const rows=await Promise.all(Array.from({length:4},()=>save(fields,key)));
    const row=rows[0]!;assert.ok(rows.every(value=>value!.id===row.id));
    assert.equal(await prisma.opportunity.count({where:{companyId}}),1);
    assert.equal(await prisma.activityLog.count({where:{actorId:user.id,entityId:row.id,action:'CREATED'}}),1);
    await save({...fields,title:'Otro nombre'},key,undefined,409);
    await save({...fields,companyId:'foreign-unavailable'},undefined,undefined,422);
    for (const injected of ([{estimatedValue:'100'}, {sellerProfileId:'foreign'}, {status:'WON'}, {probability:'101'}, {nextFollowUpAt:'2026-02-30'}] as Record<string,string>[]))
      await save({...fields,...injected},undefined,undefined,422);
    const edit={title:fields.title,interest:fields.interest,status:'DISCOVERY',probability:'50',nextStep:'',nextFollowUpAt:'',notes:''};
    const updated=(await save(edit,undefined,row))!;assert.equal(updated.fields.probability,'50');assert.equal(updated.fields.nextFollowUpAt,'');
    await save(edit,undefined,row,409);await save({...edit,companyId},undefined,updated,422);
    const actual=await prisma.opportunity.findUniqueOrThrow({where:{id:row.id}});assert.equal(actual.companyId,companyId);assert.equal(actual.estimatedValue,null);assert.equal(actual.contactId,null);assert.equal(actual.sellerProfileId,null);
    assert.equal(await prisma.activityLog.count({where:{actorId:user.id,entityId:row.id,action:'UPDATED'}}),1);
    const closed=await prisma.opportunity.update({where:{id:row.id},data:{status:'WON'}});
    await save(edit,undefined,{...updated,updatedAt:closed.updatedAt.toISOString()},409);
    console.log('PASS opportunities: scoped company, admin role, concurrent idempotency, dates/probability, stale edits, preserved relations, closed protection, financial fields rejected, atomic audits.');
  }finally{
    await prisma.activityLog.deleteMany({where:{actorId:user.id,companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.opportunity.deleteMany({where:{companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.company.deleteMany({where:{id:companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.verificationToken.deleteMany({where:{identifier:{in:[`portal-session:${workspace.id}:${user.id}`,`portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where:{id:user.id}});console.log('CLEANUP OPPORTUNITIES: temporary ICC company, opportunities, account, audits and grants removed.');
  }
}
main().catch((error:unknown)=>{console.error(error instanceof assert.AssertionError?error.message:'Opportunities test failed; private diagnostics suppressed.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
