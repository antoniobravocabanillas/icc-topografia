import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {prisma} from '../lib/prisma';
import {listPortalResource,savePortalResource,PortalResourceError} from '../lib/server/portal-resources';
import {PortalContactError} from '../lib/server/portal-contacts';
import type {WorkspacePortalToken} from '../lib/server/workspace-portal-session';
type RecordDto={id:string;updatedAt:string;fields:Record<string,string>};
async function main(){
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,'icc-topografia:20616116313');
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:'icc-topografia',active:true,deletedAt:null,
    companies:{some:{document:'20616116313',deletedAt:null}}},select:{id:true}});
  const run=randomUUID(),companyId=`000-contact-company-${run}`,password=randomBytes(24).toString('hex'),email=`contacts-${run}@example.test`;
  const user=await prisma.user.create({data:{email,name:'Prueba contactos',role:'CUSTOMER',emailVerified:new Date(),passwordHash:await bcrypt.hash(password,12),
    terraqoMemberships:{create:{workspaceId:workspace.id,role:'ADMIN',active:true}}},select:{id:true}});
  const token:WorkspacePortalToken={sub:user.id,workspaceId:workspace.id,workspaceSlug:'icc-topografia',role:'ADMIN',iat:1,exp:2};
  const http=process.env.TEST_CONTACTS_HTTP==='1';let bearer='';
  const base='https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal';
  const request=(path:string,body?:unknown,key?:string)=>fetch(`${base}/${path}`,{method:body?'POST':'GET',headers:{'content-type':'application/json',authorization:`Bearer ${bearer}`,...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000),redirect:'error'});
  const save=async(fields:Record<string,string>,key=randomBytes(16).toString('hex'),row?:RecordDto,status=200)=>{
    if(http){const response=await request('resources/contacts',{fields,...(row?{id:row.id,version:row.updatedAt}:{})},key);assert.equal(response.status,status);return status===200?(await response.json()).data.record as RecordDto:null;}
    try{const result=await savePortalResource(token,'contacts',fields,key,row?.id,row?.updatedAt);assert.equal(status,200);return result as RecordDto;}
    catch(error){const code=error instanceof PortalContactError||error instanceof PortalResourceError?error.status:error instanceof z.ZodError?422:null;if(code===null)throw error;assert.equal(code,status);return null;}
  };
  try{
    await prisma.company.create({data:{id:companyId,terraqoWorkspaceId:workspace.id,legalName:'Empresa temporal de contactos'}});
    if(http){const login=await request('login',{email,password});assert.equal(login.status,200);bearer=(await login.json()).data.token;}
    else for(const role of ['MEMBER','CLIENT','PROFESSIONAL','VIEWER'] as const)
      for(const code of ['contacts','contactCompanies'] as const)await assert.rejects(listPortalResource({...token,role},code),error=>error instanceof PortalResourceError&&error.status===403);
    const page=http?(await(await request('resources/contactCompanies')).json()).data:await listPortalResource(token,'contactCompanies');
    assert.ok(page.records.some((row:{id:string})=>row.id===companyId));
    for(const row of page.records) assert.deepEqual(Object.keys(row.fields),['title']);
    const fields={companyId,name:'Contacto temporal',roleTitle:'Coordinacion',email:`PERSON-${run}@example.test`,phone:'12345',whatsapp:'67890'};
    const key=randomBytes(16).toString('hex');const rows=await Promise.all(Array.from({length:4},()=>save(fields,key)));
    const row=rows[0]!;assert.ok(rows.every(value=>value!.id===row.id));
    assert.equal(await prisma.contact.count({where:{companyId}}),1);assert.equal(row.fields.email,fields.email.toLowerCase());
    assert.equal(await prisma.activityLog.count({where:{actorId:user.id,entityId:row.id,action:'CREATED'}}),1);
    await save({...fields,name:'Otro nombre'},key,undefined,409);
    await save(fields,undefined,undefined,409);
    await save({...fields,companyId:'foreign-unavailable'},undefined,undefined,422);
    await save({...fields,isPrimary:'true'},undefined,undefined,422);
    const edit={name:fields.name,roleTitle:'Responsable comercial',email:fields.email.toLowerCase(),phone:'',whatsapp:''};
    const updated=(await save(edit,undefined,row))!;assert.equal(updated.fields.phone,'');assert.equal(updated.fields.whatsapp,'');
    await save(edit,undefined,row,409);
    await save({...edit,companyId},undefined,updated,422);
    const actual=await prisma.contact.findUniqueOrThrow({where:{id:row.id}});assert.equal(actual.companyId,companyId);assert.equal(actual.isPrimary,false);
    assert.equal(await prisma.activityLog.count({where:{actorId:user.id,entityId:row.id,action:'UPDATED'}}),1);
    console.log('PASS contacts: scoped company selector, admin role, concurrent idempotency, normalized email uniqueness, stale edit, explicit clearing, protected company/primary and atomic audits.');
  }finally{
    await prisma.activityLog.deleteMany({where:{actorId:user.id,companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.contact.deleteMany({where:{companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.company.deleteMany({where:{id:companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.verificationToken.deleteMany({where:{identifier:{in:[`portal-session:${workspace.id}:${user.id}`,`portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where:{id:user.id}});console.log('CLEANUP CONTACTS: temporary ICC company, contacts, account, audits and grants removed.');
  }
}
main().catch((error:unknown)=>{console.error(error instanceof assert.AssertionError?error.message:'Contacts test failed; private diagnostics suppressed.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
