import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { POST } from "../app/api/internal/professional-document-cleanup/route";
async function main() {
  const original=process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET, find=prisma.activityLog.findFirst;
  process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET="A".repeat(64);
  let reads=0; prisma.activityLog.findFirst=(async()=>{reads++;return null;}) as typeof find;
  const request=(auth:string,body:string)=>new Request("https://example.test/api/internal/professional-document-cleanup",{method:"POST",headers:{authorization:auth,"content-type":"application/json"},body});
  try {
    for (const auth of ["","Bearer invalid","Bearer "+"ñ".repeat(64)]) assert.equal((await POST(request(auth,'{}'))).status,401);
    assert.equal(reads,0);
    const auth="Bearer "+"A".repeat(64);
    for (const body of ['null','{}','{"auditId":"../bad"}','{"auditId":"id","extra":true}']) assert.equal((await POST(request(auth,body))).status,422);
    assert.equal((await POST(request(auth,"x".repeat(1025)))).status,413); assert.equal(reads,0);
    const response=await POST(request(auth,'{"auditId":"fixture"}'));assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),"no-store"); assert.deepEqual(await response.json(),{result:"skipped"}); assert.equal(reads,1);
    console.log("PASS internal cleanup: dedicated credential, byte-safe comparison, bounded strict body, authorization before database and private response.");
  } finally {prisma.activityLog.findFirst=find; if(original===undefined)delete process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET;else process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET=original;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
