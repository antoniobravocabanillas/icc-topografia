import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {prisma} from "../lib/prisma";
import {saveQuoteDraft} from "../lib/server/quote-drafts";
import {transitionQuote,QuoteStateError} from "../lib/server/quote-state";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,"icc-topografia:20616116313");
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:"icc-topografia",active:true,deletedAt:null,companies:{some:{document:"20616116313",deletedAt:null}}},select:{id:true}});
  const run=randomUUID(),companyId=`test-draft-company-${run}`,ids:string[]=[];
  const user=await prisma.user.create({data:{email:`quote-draft-${run}@example.test`,name:"Prueba borrador comercial",role:"CUSTOMER"},select:{id:true}});
  const rejected=(status:number)=>(error:unknown)=>error instanceof QuoteStateError && error.status===status;
  const input={companyId,customerName:"Empresa temporal de borrador",currency:"PEN",tax:"0.05",items:[
    {description:"Primera línea",quantity:3,unitPrice:"0.10",discount:"0.01"},
    {description:"Segunda línea",quantity:1,unitPrice:"0.20"}],terms:"Condición temporal",validUntil:"2090-12-31"};
  const command={workspaceId:workspace.id,actorId:user.id,input,key:randomBytes(16).toString("hex"),source:"portal" as const};
  try {
    await prisma.company.create({data:{id:companyId,terraqoWorkspaceId:workspace.id,legalName:"Empresa temporal de borradores"}});
    const copies=await Promise.all([saveQuoteDraft(command),saveQuoteDraft(command),saveQuoteDraft(command),saveQuoteDraft(command)]);
    const quote=copies[0];ids.push(quote.id);assert.ok(copies.every(row=>row.id===quote.id));
    assert.equal(quote.total.toFixed(2),"0.54");assert.equal(quote.subtotal.toFixed(2),"0.50");assert.equal(quote.discount.toFixed(2),"0.01");assert.equal(quote.publicToken,null);
    assert.equal(quote.items[0].description,"Primera línea");assert.equal(quote.items[1].description,"Segunda línea");
    assert.equal(await prisma.activityLog.count({where:{quoteId:quote.id,action:"CREATED"}}),1);
    await assert.rejects(saveQuoteDraft({...command,input:{...input,tax:"0.06"}}),rejected(409));
    const {companyId:unused,...editInput}=input;assert.equal(unused,companyId);
    const edit={...command,input:{...editInput,tax:"0.10"},id:quote.id,version:quote.updatedAt.toISOString(),key:randomBytes(16).toString("hex")};
    const saved=await saveQuoteDraft(edit);assert.equal(saved.total.toFixed(2),"0.59");assert.equal(saved.companyId,companyId);
    const retry=await saveQuoteDraft(edit);assert.equal(retry.updatedAt.toISOString(),saved.updatedAt.toISOString());
    assert.equal(await prisma.activityLog.count({where:{quoteId:quote.id,action:"UPDATED"}}),1);
    await assert.rejects(saveQuoteDraft({...edit,key:randomBytes(16).toString("hex")}),rejected(409));
    const opportunity=await prisma.opportunity.create({data:{terraqoWorkspaceId:workspace.id,companyId,code:`TEST-OP-${run}`,title:"Oportunidad temporal",status:"OPEN",estimatedValue:"999.99"}});
    const conversion={...command,key:randomBytes(16).toString("hex"),source:"admin" as const,convertOpportunity:true,input:{...input,opportunityId:opportunity.id}};
    const converted=await saveQuoteDraft(conversion);ids.push(converted.id);assert.equal(converted.total.toFixed(2),"0.54");
    assert.equal((await prisma.opportunity.findUniqueOrThrow({where:{id:opportunity.id}})).status,"PROPOSAL");
    assert.equal((await saveQuoteDraft(conversion)).id,converted.id);assert.equal(await prisma.activityLog.count({where:{quoteId:converted.id,action:"CONVERTED"}}),1);
    const issued=await transitionQuote({workspaceId:workspace.id,quoteId:converted.id,actorId:user.id,source:"admin",status:"SENT",version:converted.updatedAt.toISOString()});
    await transitionQuote({workspaceId:workspace.id,publicToken:issued.publicToken!,source:"public",status:"ACCEPTED"});
    assert.equal((await prisma.opportunity.findUniqueOrThrow({where:{id:opportunity.id}})).status,"WON");
    const count=await prisma.quote.count({where:{companyId}});
    for(const invalid of [{...input,total:"0.01"},{...input,companyId:"foreign-company"},{...input,items:[{description:"Inválido",quantity:1,unitPrice:"0.10",discount:"1.00"}]},{...input,currency:"BTC"}]) {
      await assert.rejects(saveQuoteDraft({...command,input:invalid,key:randomBytes(16).toString("hex")}));
    }
    assert.equal(await prisma.quote.count({where:{companyId}}),count);
    const sent=await transitionQuote({workspaceId:workspace.id,quoteId:quote.id,actorId:user.id,source:"admin",status:"SENT",version:saved.updatedAt.toISOString()});
    await assert.rejects(saveQuoteDraft({...edit,version:sent.updatedAt.toISOString(),key:randomBytes(16).toString("hex")}),rejected(409));
    const view=await transitionQuote({workspaceId:workspace.id,publicToken:sent.publicToken!,source:"public",status:"VIEWED"});
    const outcomes=await Promise.allSettled([transitionQuote({workspaceId:workspace.id,publicToken:sent.publicToken!,source:"public",status:"ACCEPTED"}),saveQuoteDraft({...edit,version:view.updatedAt.toISOString(),key:randomBytes(16).toString("hex")})]);
    assert.equal(outcomes[0].status,"fulfilled");assert.equal(outcomes[1].status,"rejected");
    assert.equal((await prisma.sale.findUniqueOrThrow({where:{quoteId:quote.id}})).amount.toFixed(2),"0.59");
    console.log("PASS quote drafts: exact multi-line totals/order, no public draft link, concurrent create idempotency, edit receipts, stale keys/versions, foreign relations/forged totals/discounts rejected, issued scope immutable during acceptance.");
  } finally {
    const own=await prisma.quote.findMany({where:{terraqoWorkspaceId:workspace.id,companyId},select:{id:true}});ids.push(...own.map(row=>row.id));
    await prisma.notification.deleteMany({where:{terraqoWorkspaceId:workspace.id,href:{in:ids.map(id=>`/admin/cotizaciones?quote=${id}`)}}});
    await prisma.activityLog.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});
    await prisma.commission.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});
    await prisma.sale.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});
    await prisma.quote.deleteMany({where:{terraqoWorkspaceId:workspace.id,companyId}});
    await prisma.opportunity.deleteMany({where:{companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.company.deleteMany({where:{id:companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.user.delete({where:{id:user.id}});
    console.log("CLEANUP DRAFTS: owned temporary ICC quotations/items, sales, notices, audits, company and account removed; no funds transferred.");
  }
}
main().catch((error:unknown)=>{console.error(error instanceof assert.AssertionError?error.message:"Quote draft test failed; confidential diagnostics suppressed.");process.exitCode=1;}).finally(()=>prisma.$disconnect());
