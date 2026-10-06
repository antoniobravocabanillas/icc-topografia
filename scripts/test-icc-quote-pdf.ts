import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {prisma} from "../lib/prisma";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,"icc-topografia:20616116313");
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:"icc-topografia",active:true,deletedAt:null,
    companies:{some:{document:"20616116313",deletedAt:null}}},select:{id:true}});
  const id=`test-pdf-${randomUUID()}`, token=randomBytes(32).toString("hex");
  const base=process.env.TEST_PORTAL_URL;assert.ok(base?.startsWith("https://"));
  const request=(suffix="")=>fetch(`${base}/api/quotes/${id}/pdf${suffix}`,{redirect:"error",cache:"no-store"});
  try {
    await prisma.quote.create({data:{id,number:id,terraqoWorkspaceId:workspace.id,customerName:"Prueba privada temporal",status:"SENT",
      currency:"PEN",subtotal:"1.20",total:"1.20",publicToken:token,items:{create:{description:"Servicio de prueba",quantity:1,unitPrice:"1.20",subtotal:"1.20"}}}});
    assert.equal((await request()).status,404);
    assert.equal((await request(`?token=${randomBytes(32).toString("hex")}`)).status,404);
    const response=await request(`?token=${token}`);assert.equal(response.status,200);
    assert.match(response.headers.get("cache-control")??"",/no-store/);assert.equal(response.headers.get("referrer-policy"),"no-referrer");
    assert.match(response.headers.get("content-type")??"",/application\/pdf/);assert.equal((await response.text()).slice(0,5),"%PDF-");
    await prisma.quote.update({where:{id},data:{status:"DRAFT"}});assert.equal((await request(`?token=${token}`)).status,404);
    await prisma.quote.update({where:{id},data:{status:"SENT",deletedAt:new Date()}});assert.equal((await request(`?token=${token}`)).status,404);
    await prisma.quote.update({where:{id},data:{deletedAt:null,publicToken:randomBytes(32).toString("hex")}});assert.equal((await request(`?token=${token}`)).status,404);
    console.log("PASS deployed private quote PDF: anonymous ID/wrong token/draft/deleted/revoked link denied; current link returns PDF with private no-store and no-referrer.");
  } finally {
    await prisma.quote.deleteMany({where:{id,terraqoWorkspaceId:workspace.id}});
    assert.equal(await prisma.quote.count({where:{id}}),0);
    console.log("CLEANUP PDF: owned temporary ICC quotation and items removed.");
  }
}
main().catch((error:unknown)=>{console.error(error instanceof assert.AssertionError?error.message:"Private PDF test failed; confidential diagnostics suppressed.");process.exitCode=1;}).finally(()=>prisma.$disconnect());
