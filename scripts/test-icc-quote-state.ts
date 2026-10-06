import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {prisma} from "../lib/prisma";
import {transitionQuote,QuoteStateError} from "../lib/server/quote-state";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,"icc-topografia:20616116313");
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:"icc-topografia",active:true,deletedAt:null,
    companies:{some:{document:"20616116313",deletedAt:null}}},select:{id:true}});
  const run=randomUUID(),companyId=`test-quote-company-${run}`,staffId=`test-quote-staff-${run}`;
  const user=await prisma.user.create({data:{email:`quote-state-${run}@example.test`,name:"Prueba transacciones cotizaciÃ³n",role:"CUSTOMER"},select:{id:true}});
  const ids:string[]=[];
  const create=async(status:"SENT"|"DRAFT"="SENT",overrides:Record<string,unknown>={})=>{
    const id=`test-quote-${randomUUID()}`;ids.push(id);
    return prisma.quote.create({data:{id,number:id,terraqoWorkspaceId:workspace.id,companyId,customerName:"Empresa temporal",
      sellerProfileId:staffId,currency:"PEN",status,publicToken:randomBytes(32).toString("hex"),subtotal:"300.30",total:"300.30",
      items:{create:{description:"Servicio temporal",quantity:3,unitPrice:"100.10",subtotal:"300.30"}},...overrides}});
  };
  const rejected=(status:number)=>(error:unknown)=>error instanceof QuoteStateError&&error.status===status;
  try {
    await prisma.company.create({data:{id:companyId,terraqoWorkspaceId:workspace.id,legalName:"Empresa temporal de cotizaciones"}});
    await prisma.staffProfile.create({data:{id:staffId,terraqoWorkspaceId:workspace.id,displayName:"Responsable temporal",roleTitle:"Comercial",
      certifications:[],documents:[],specialties:[],tools:{},commissionType:"SALE_PERCENTAGE",commissionRate:"5"}});
    const quote=await create();
    const admin={workspaceId:workspace.id,quoteId:quote.id,status:"ACCEPTED" as const,actorId:user.id,version:quote.updatedAt.toISOString(),source:"admin" as const};
    const publicCommand={workspaceId:workspace.id,publicToken:quote.publicToken!,status:"ACCEPTED" as const,source:"public" as const};
    await Promise.all([transitionQuote(publicCommand),transitionQuote(admin),transitionQuote(publicCommand),transitionQuote(admin)]);
    assert.equal(await prisma.sale.count({where:{quoteId:quote.id}}),1);assert.equal(await prisma.commission.count({where:{quoteId:quote.id}}),1);
    const sale=await prisma.sale.findUniqueOrThrow({where:{quoteId:quote.id}});assert.equal(sale.amount.toFixed(2),"300.30");assert.equal(sale.commissionAmount.toFixed(2),"15.02");assert.equal(sale.status,"CONFIRMED");assert.equal(sale.paidAt,null);
    assert.equal((await prisma.commission.findFirstOrThrow({where:{quoteId:quote.id}})).amount.toFixed(2),"15.02");
    assert.equal(await prisma.activityLog.count({where:{quoteId:quote.id,action:"STATUS_CHANGED"}}),1);
    assert.ok(await prisma.notification.count({where:{href:`/admin/cotizaciones?quote=${quote.id}`}})<=1);
    await assert.rejects(transitionQuote({...publicCommand,status:"REJECTED"}),rejected(409));
    const viewedAfterDecision=await transitionQuote({...publicCommand,status:"VIEWED"});
    assert.equal(viewedAfterDecision.status,"ACCEPTED");
    assert.equal(await prisma.sale.count({where:{quoteId:quote.id}}),1);
    assert.equal(await prisma.activityLog.count({where:{quoteId:quote.id,action:"STATUS_CHANGED"}}),1);
    const revision=await create();
    const refused=await transitionQuote({workspaceId:workspace.id,publicToken:revision.publicToken!,source:"public",status:"REJECTED"});
    const reset=await transitionQuote({workspaceId:workspace.id,quoteId:revision.id,source:"admin",actorId:user.id,status:"DRAFT",version:refused.updatedAt.toISOString()});
    assert.equal(reset.publicToken,null);assert.equal(reset.rejectedAt,null);
    await assert.rejects(transitionQuote({workspaceId:workspace.id,publicToken:revision.publicToken!,source:"public",status:"ACCEPTED"}),rejected(404));
    const race=await create(); const commands=["ACCEPTED","REJECTED"] as const;
    const outcomes=await Promise.allSettled(commands.map(status=>transitionQuote({workspaceId:workspace.id,publicToken:race.publicToken!,source:"public",status})));
    assert.equal(outcomes.filter(value=>value.status==="fulfilled").length,1);
    assert.equal(outcomes.filter(value=>value.status==="rejected"&&rejected(409)(value.reason)).length,1);
    const raced=await prisma.quote.findUniqueOrThrow({where:{id:race.id}});
    assert.equal(await prisma.sale.count({where:{quoteId:race.id}}),raced.status==="ACCEPTED"?1:0);
    assert.equal(await prisma.notification.count({where:{href:`/admin/cotizaciones?quote=${race.id}`}}),1);
    const draft=await create("DRAFT");
    await assert.rejects(transitionQuote({workspaceId:workspace.id,publicToken:draft.publicToken!,source:"public",status:"ACCEPTED"}),rejected(409));
    const sent=await transitionQuote({workspaceId:workspace.id,quoteId:draft.id,actorId:user.id,source:"admin",status:"SENT",version:draft.updatedAt.toISOString()});
    assert.notEqual(sent.publicToken,draft.publicToken);
    await assert.rejects(transitionQuote({workspaceId:workspace.id,publicToken:draft.publicToken!,source:"public",status:"ACCEPTED"}),rejected(404));
    await assert.rejects(transitionQuote({workspaceId:workspace.id,quoteId:draft.id,actorId:user.id,source:"admin",status:"VIEWED",version:draft.updatedAt.toISOString()}),rejected(409));
    await transitionQuote({workspaceId:workspace.id,publicToken:sent.publicToken!,source:"public",status:"VIEWED"});
    await prisma.staffProfile.update({where:{id:staffId},data:{commissionType:"FIXED_AMOUNT",fixedCommission:"7.23",commissionRate:"95"}});
    const fixed=await create();await transitionQuote({workspaceId:workspace.id,publicToken:fixed.publicToken!,source:"public",status:"ACCEPTED"});
    assert.equal((await prisma.sale.findUniqueOrThrow({where:{quoteId:fixed.id}})).commissionAmount.toFixed(2),"7.23");
    await prisma.staffProfile.update({where:{id:staffId},data:{commissionType:"MARGIN_PERCENTAGE"}});
    const unsupported=await create();
    await assert.rejects(transitionQuote({workspaceId:workspace.id,publicToken:unsupported.publicToken!,source:"public",status:"ACCEPTED"}),rejected(422));
    assert.equal((await prisma.quote.findUniqueOrThrow({where:{id:unsupported.id}})).status,"SENT");
    assert.equal(await prisma.commission.count({where:{quoteId:unsupported.id}}),0);assert.equal(await prisma.sale.count({where:{quoteId:unsupported.id}}),0);
    const malformed=await create("SENT",{total:"300.3000000001"});
    await assert.rejects(transitionQuote({workspaceId:workspace.id,publicToken:malformed.publicToken!,source:"public",status:"ACCEPTED"}),rejected(422));
    const invalidLine=await create("SENT",{items:{create:{description:"Servicio temporal",quantity:3,unitPrice:"100.10",subtotal:"299.99"}}});
    await assert.rejects(transitionQuote({workspaceId:workspace.id,publicToken:invalidLine.publicToken!,source:"public",status:"ACCEPTED"}),rejected(422));
    const expired=await create("SENT",{validUntil:new Date("1990-01-01T00:00:00Z")});
    await assert.rejects(transitionQuote({workspaceId:workspace.id,publicToken:expired.publicToken!,source:"public",status:"ACCEPTED"}),rejected(409));
    await assert.rejects(transitionQuote({...admin,workspaceId:"foreign-unavailable"}),rejected(403));
    console.log("PASS quote transactions: public/admin concurrency, single sale/commission/audit/notice, exact rate/fixed commission, terminal states, token rotation, stale version, expiry, malformed totals and rollback.");
  } finally {
    await prisma.notification.deleteMany({where:{terraqoWorkspaceId:workspace.id,href:{in:ids.map(id=>`/admin/cotizaciones?quote=${id}`)}}});
    await prisma.activityLog.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});
    await prisma.commission.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});
    await prisma.sale.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:{in:ids}}});
    await prisma.quote.deleteMany({where:{terraqoWorkspaceId:workspace.id,id:{in:ids}}});
    await prisma.staffProfile.deleteMany({where:{id:staffId,terraqoWorkspaceId:workspace.id}});
    await prisma.company.deleteMany({where:{id:companyId,terraqoWorkspaceId:workspace.id}});
    await prisma.user.delete({where:{id:user.id}});
    console.log("CLEANUP QUOTE STATE: owned temporary ICC quotes/items, sales, commissions, notices, audits, staff, company and account removed; no funds transferred.");
  }
}
main().catch((error:unknown)=>{console.error(error instanceof assert.AssertionError?error.message:"Quote transaction test failed; private diagnostics suppressed.");process.exitCode=1;}).finally(()=>prisma.$disconnect());
