import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {prisma} from "../lib/prisma";
function decode(value:string) {return value.replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");}
function responseForm(html:string,status:"ACCEPTED"|"REJECTED") {
  const forms=[...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)];
  for(const form of forms) {
    const data=new FormData();
    for(const input of form[1].matchAll(/<input\b[^>]*>/g)) {
      const name=input[0].match(/\bname="([^"]*)"/)?.[1],value=input[0].match(/\bvalue="([^"]*)"/)?.[1];
      if(name)data.append(decode(name),decode(value??""));
    }
    if(data.get("status")===status) {assert.ok(data.get("version"));assert.ok([...data.keys()].some(key=>key.startsWith("$ACTION_")));return data;}
  }
  throw new Error("Expected proposal response form missing.");
}
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,"icc-topografia:20616116313");
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:"icc-topografia",active:true,deletedAt:null,
    companies:{some:{document:"20616116313",deletedAt:null}}},select:{id:true}});
  const id=`test-public-quote-${randomUUID()}`,token=randomBytes(32).toString("hex");
  const url=`https://terraqoglobal.com/cotizaciones/${token}`;
  const post=(form:FormData)=>fetch(url,{method:"POST",body:form,headers:{Origin:"https://terraqoglobal.com"},redirect:"manual"});
  try {
    await prisma.quote.create({data:{id,number:id,terraqoWorkspaceId:workspace.id,customerName:"Propuesta temporal de validación",status:"SENT",
      currency:"PEN",subtotal:"0.30",total:"0.30",publicToken:token,items:{create:{description:"Servicio temporal",quantity:3,unitPrice:"0.10",subtotal:"0.30"}}}});
    let page=await fetch(url,{redirect:"error",cache:"no-store"});assert.equal(page.status,200);
    assert.equal(page.headers.get("referrer-policy"),"no-referrer");assert.match(page.headers.get("x-robots-tag")??"",/noindex/);
    const html=await page.text(),accepted=responseForm(html,"ACCEPTED"),rejected=responseForm(html,"REJECTED");
    assert.equal((await prisma.quote.findUniqueOrThrow({where:{id}})).status,"VIEWED");
    const invalid=responseForm(html,"ACCEPTED");invalid.set("status","DRAFT");invalid.set("redirectTo","https://example.test/phishing");
    const denied=await post(invalid);assert.equal(denied.status,303);assert.ok(denied.headers.get("location")?.endsWith("?error=quote_review"));assert.ok(!denied.headers.get("location")?.includes("example.test"));
    const outcomes=await Promise.all([post(accepted),post(rejected)]);
    assert.equal(outcomes.filter(value=>value.status===303 && value.headers.get("location")?.includes("?success=")).length,1);
    assert.equal(outcomes.filter(value=>value.status===303 && value.headers.get("location")?.includes("?error=quote_conflict")).length,1);
    const quote=await prisma.quote.findUniqueOrThrow({where:{id}});assert.ok(["ACCEPTED","REJECTED"].includes(quote.status));
    assert.equal(await prisma.sale.count({where:{quoteId:id}}),quote.status==="ACCEPTED"?1:0);
    assert.equal(await prisma.notification.count({where:{href:`/admin/cotizaciones?quote=${id}`}}),1);
    const retry=await post(quote.status==="ACCEPTED"?accepted:rejected);assert.equal(retry.status,303);assert.ok(retry.headers.get("location")?.includes("?success="));
    page=await fetch(url,{redirect:"error",cache:"no-store"});assert.equal(page.status,200);const terminalHtml=await page.text();
    assert.ok(!terminalHtml.includes('name="status" value="ACCEPTED"'));assert.equal((await prisma.quote.findUniqueOrThrow({where:{id}})).status,quote.status);
    await prisma.quote.update({where:{id},data:{status:"DRAFT"}});assert.equal((await fetch(url,{redirect:"error",cache:"no-store"})).status,404);
    console.log("PASS deployed public quotation: private headers, versioned forms, safe redirects, forged state denial, concurrent decision conflict, idempotent retry, terminal view protection and draft privacy.");
  } finally {
    await prisma.notification.deleteMany({where:{terraqoWorkspaceId:workspace.id,href:`/admin/cotizaciones?quote=${id}`}});
    await prisma.activityLog.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:id}});
    await prisma.commission.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:id}});
    await prisma.sale.deleteMany({where:{terraqoWorkspaceId:workspace.id,quoteId:id}});
    await prisma.quote.deleteMany({where:{id,terraqoWorkspaceId:workspace.id}});
    console.log("CLEANUP PUBLIC QUOTE: owned temporary quotation, items, sales, notices and audits removed; no funds transferred.");
  }
}
main().catch((error:unknown)=>{console.error(error instanceof assert.AssertionError?error.message:"Public quote test failed; private diagnostics suppressed.");process.exitCode=1;}).finally(()=>prisma.$disconnect());
