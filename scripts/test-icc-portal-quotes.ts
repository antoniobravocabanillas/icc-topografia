import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import bcrypt from "bcryptjs";
import {prisma} from "../lib/prisma";
import {listPortalResource,savePortalResource,PortalResourceError} from "../lib/server/portal-resources";
import {QuoteStateError} from "../lib/server/quote-state";
import type {WorkspacePortalToken} from "../lib/server/workspace-portal-session";
let phase="workspace";
type RecordDto={id:string;status:string;updatedAt:string;fields:Record<string,string>};
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,"icc-topografia:20616116313");
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:"icc-topografia",active:true,deletedAt:null,companies:{some:{document:"20616116313",deletedAt:null}}},select:{id:true}});
  const run=randomUUID(),companyId=`test-portal-quote-company-${run}`,password=randomBytes(24).toString("base64url"),ids:string[]=[];
  phase="temporary-admin-account";
  const user=await prisma.user.create({data:{email:`portal-quotes-${run}@example.test`,name:"Prueba cotizador móvil",role:"CUSTOMER",emailVerified:new Date(),passwordHash:await bcrypt.hash(password,12)},select:{id:true,email:true}});
  phase="temporary-client-account";
  const client=await prisma.user.create({data:{email:`portal-quote-client-${run}@example.test`,name:"Prueba cliente propuesta",role:"CUSTOMER",emailVerified:new Date(),passwordHash:await bcrypt.hash(password,12)},select:{id:true,email:true}});
  const adminToken:WorkspacePortalToken={sub:user.id,workspaceId:workspace.id,workspaceSlug:"icc-topografia",role:"ADMIN",iat:1,exp:2};
  const clientToken={...adminToken,sub:client.id,role:"CLIENT" as const};
  const http=process.env.TEST_QUOTES_HTTP==="1";let bearer="",clientBearer="";
  const request=(path:string,fields?:unknown,key?:string,isClient=false)=>fetch(`${process.env.TEST_PORTAL_URL}/api/public/workspaces/icc-topografia/portal/${path}`,{
    method:fields?"POST":"GET",headers:{...(bearer && path!=="login"?{Authorization:`Bearer ${isClient?clientBearer:bearer}`} :{}),...(fields?{"Content-Type":"application/json"}:{}),...(key?{"Idempotency-Key":key}:{})},body:fields?JSON.stringify(fields):undefined,redirect:"error"});
  const save=async(fields:Record<string,string>,key=randomBytes(16).toString("hex"),row?:RecordDto,status=200,isClient=false)=>{
    if(http) {const response=await request("resources/quotes",{fields,...(row?{id:row.id,version:row.updatedAt}:{})},key,isClient);assert.equal(response.status,status);return status===200?(await response.json()).data.record as RecordDto:null;}
    try {const result=await savePortalResource(isClient?clientToken:adminToken,"quotes",fields,key,row?.id,row?.updatedAt);assert.equal(status,200);return result as RecordDto;}
    catch(error) {if(error instanceof QuoteStateError || error instanceof PortalResourceError){assert.equal(error.status,status);return null;}throw error;}
  };
  const list=async(isClient=false)=>http?(await(await request("resources/quotes",undefined,undefined,isClient)).json()).data:await listPortalResource(isClient?clientToken:adminToken,"quotes");
  try {
    phase="fixtures";
    await prisma.company.create({data:{id:companyId,terraqoWorkspaceId:workspace.id,legalName:"Empresa temporal de propuestas"}});
    const customer=await prisma.client.create({data:{terraqoWorkspaceId:workspace.id,companyId,name:"Cliente temporal de propuestas",email:client.email!}});
    await prisma.clientAccount.create({data:{terraqoWorkspaceId:workspace.id,companyId,clientId:customer.id,userId:client.id,status:"active"}});
    await prisma.terraqoWorkspaceMember.createMany({data:[{workspaceId:workspace.id,userId:user.id,role:"ADMIN",active:true},{workspaceId:workspace.id,userId:client.id,role:"CLIENT",active:true}]});
    if(http) {
      const login=await request("login",{email:user.email,password});assert.equal(login.status,200);bearer=(await login.json()).data.token;
      const loginClient=await request("login",{email:client.email,password});assert.equal(loginClient.status,200);clientBearer=(await loginClient.json()).data.token;
    }
    if(!http){
      await assert.rejects(listPortalResource(clientToken,"quoteClients"),error=>error instanceof PortalResourceError && error.status===403);
      const options=await listPortalResource(adminToken,"quoteClients");
      for(const option of options.records)assert.deepEqual(Object.keys(option.fields).sort(),["companyId","title"]);
    }
    phase="draft-command";
    const fields={companyId,clientId:customer.id,customerName:"Propuesta temporal",currency:"PEN",tax:"0.05",items:JSON.stringify([{description:"Servicio de prueba",quantity:3,unitPrice:"0.10",discount:"0.01"}]),terms:"Alcance temporal"};
    const key=randomBytes(16).toString("hex");const outcomes=await Promise.allSettled([save(fields,key),save(fields,key),save(fields,key),save(fields,key)]);
    const failed=outcomes.find(value=>value.status==="rejected");if(failed?.status==="rejected")throw failed.reason;
    const copies=outcomes.map(value=>{assert.equal(value.status,"fulfilled");return value.status==="fulfilled"?value.value:null;});
    const draft=copies[0]!;ids.push(draft.id);assert.ok((await list()).records.some((row:RecordDto)=>row.id===draft.id),"Created quote must appear in the latest page.");assert.ok(copies.every(row=>row!.id===draft.id));assert.equal(draft.fields.total,"0.34");assert.equal(draft.fields.publicLink,"");
    assert.ok(!(await list(true)).records.some((row:RecordDto)=>row.id===draft.id));
    if(http) {
      const pdf=await fetch(`${process.env.TEST_PORTAL_URL}/api/quotes/${draft.id}/pdf?workspace=icc-topografia`,{headers:{Authorization:`Bearer ${bearer}`},redirect:"error"});assert.equal(pdf.status,200);assert.equal((await pdf.text()).slice(0,5),"%PDF-");
      const privateDraft=await fetch(`${process.env.TEST_PORTAL_URL}/api/quotes/${draft.id}/pdf?workspace=icc-topografia`,{headers:{Authorization:`Bearer ${clientBearer}`},redirect:"error"});assert.equal(privateDraft.status,404);
    }
    phase="authorization";
    await save(fields,undefined,undefined,403,true);
    await save({...fields,total:"1"},undefined,undefined,422);
    await save({...fields,companyId:"foreign-company"},undefined,undefined,422);
    await save({...fields,tax:"0.06"},key,undefined,409);
    phase="edit";
    const editedFields={customerName:fields.customerName,currency:fields.currency,tax:"0.10",items:fields.items,terms:"Alcance revisado"};
    const editKey=randomBytes(16).toString("hex");const edited=(await save(editedFields,editKey,draft))!;
    const retry=(await save(editedFields,editKey,draft))!;assert.equal(retry.updatedAt,edited.updatedAt);assert.equal(edited.fields.total,"0.39");
    await save(editedFields,undefined,draft,409);
    phase="decision";
    const sent=(await save({action:"STATUS",status:"SENT"},undefined,edited))!;
    {assert.ok(/^\/cotizaciones\/[a-f0-9]{64}$/.test(new URL(sent.fields.publicLink).pathname),"Issued proposal must have a scoped public link.");if(http)assert.equal(new URL(sent.fields.publicLink).origin,"https://terraqoglobal.com");const clientRows=(await list(true)).records;assert.equal(clientRows.find((row:RecordDto)=>row.id===draft.id)?.fields.publicLink,"");}
    if(http){
      const pdf=await fetch(`${process.env.TEST_PORTAL_URL}/api/quotes/${draft.id}/pdf?workspace=icc-topografia`,{headers:{Authorization:`Bearer ${clientBearer}`},redirect:"error"});
      assert.equal(pdf.status,200);assert.equal(pdf.headers.get("content-type"),"application/pdf");assert.equal((await pdf.text()).slice(0,5),"%PDF-");
    }
    await save(editedFields,undefined,sent,409);assert.ok((await list(true)).records.some((row:RecordDto)=>row.id===draft.id));
    const accepted=(await save({action:"STATUS",status:"ACCEPTED"},undefined,sent,200,true))!;
    await save({action:"STATUS",status:"ACCEPTED"},undefined,sent,200,true);
    await save({action:"STATUS",status:"REJECTED"},undefined,sent,409,true);
    assert.equal(await prisma.notification.count({where:{terraqoWorkspaceId:workspace.id,href:`/admin/cotizaciones?quote=${draft.id}`}}),1);
    assert.equal(accepted.status,"ACCEPTED");assert.equal(await prisma.sale.count({where:{quoteId:draft.id}}),1);
    await prisma.clientAccount.updateMany({where:{userId:client.id,terraqoWorkspaceId:workspace.id},data:{status:"blocked"}});
    assert.ok(!(await list(true)).records.some((row:RecordDto)=>row.id===draft.id));
    await save({action:"STATUS",status:"ACCEPTED"},undefined,accepted,403,true);
    if(http){
      const pdf=await fetch(`${process.env.TEST_PORTAL_URL}/api/quotes/${draft.id}/pdf?workspace=icc-topografia`,{headers:{Authorization:`Bearer ${clientBearer}`},redirect:"error"});assert.equal(pdf.status,404);
    }
    console.log(`PASS ${http?"HTTP":"service"} mobile quotations: scoped drafts, client draft privacy, exact totals, create/edit retries, forged totals/foreign company/stale edits denied, issued scope immutable, owned client acceptance idempotent, blocked account denied.`);
  } finally {
    const own=await prisma.quote.findMany({where:{companyId,terraqoWorkspaceId:workspace.id},select:{id:true}});ids.push(...own.map(row=>row.id));
    await prisma.notification.deleteMany({where:{terraqoWorkspaceId:workspace.id,href:{in:ids.map(id=>`/admin/cotizaciones?quote=${id}`)}}});
    await prisma.activityLog.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});
    await prisma.commission.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});
    await prisma.sale.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});
    await prisma.quote.deleteMany({where:{companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.clientAccount.deleteMany({where:{companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.client.deleteMany({where:{companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.company.deleteMany({where:{id:companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.terraqoWorkspaceMember.deleteMany({where:{workspaceId:workspace.id,userId:{in:[user.id,client.id]}}});
    await prisma.verificationToken.deleteMany({where:{identifier:{in:[user.id,client.id].flatMap(id=>[`portal-session:${workspace.id}:${id}`,`portal-login-attempt:${workspace.id}:${id}`])}}});
    await prisma.user.deleteMany({where:{id:{in:[user.id,client.id]}}});
    console.log("CLEANUP PORTAL QUOTES: owned temporary ICC quotes/items, sales, audits, accounts, client/company and access memberships removed; no funds transferred.");
  }
}
main().catch((error:unknown)=>{console.error(error instanceof assert.AssertionError?error.message:`Mobile quote verification failed at ${phase}; type ${error instanceof Error?error.constructor.name:"unknown"}; code ${error && typeof error==="object" && "code" in error && typeof error.code==="string" && /^P[0-9]{4}$/.test(error.code)?error.code:"unavailable"}; confidential diagnostics suppressed.`);process.exitCode=1;}).finally(()=>prisma.$disconnect());
