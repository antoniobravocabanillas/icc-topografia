import assert from "node:assert/strict";
import cleanup from "../netlify/functions/professional-document-cleanup.mjs";
async function main(){
  const originals={fetch:globalThis.fetch,info:console.info,warn:console.warn,secret:process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET};
  const logs:unknown[][]=[];let calls=0, body:unknown={completed:1,retry:0,blocked:0,skipped:0,backlog:{pending:0,blocked:0,overdue:0,orphaned:0},storageCleanupKey:"must-not-log"};
  console.info=(...args:unknown[])=>{logs.push(args);};console.warn=(...args:unknown[])=>{logs.push(args);};
  globalThis.fetch=(async(url:unknown,init:RequestInit)=>{calls++;assert.equal(url,"https://api.terraqoglobal.com/api/internal/professional-document-cleanup");assert.equal(init.redirect,"error");assert.equal(init.method,"POST");assert.equal((init.headers as Record<string,string>).authorization,`Bearer ${"x".repeat(64)}`);return Response.json(body);}) as typeof fetch;
  try{
    delete process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET;assert.equal((await cleanup()).status,503);assert.equal(calls,0);
    process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET="x".repeat(64);assert.equal((await cleanup()).status,200);assert.ok(!JSON.stringify(logs).includes("must-not-log"));assert.ok(!JSON.stringify(logs).includes("x".repeat(64)));
    body={completed:0,retry:1,blocked:1,skipped:0,backlog:{pending:2,blocked:1,overdue:1,orphaned:1,actorId:"private"}};assert.equal((await cleanup()).status,200);assert.equal(logs.at(-1)?.[0],"Private cleanup requires investigation");assert.ok(!JSON.stringify(logs).includes("private"));
    for(const invalid of [{completed:-1},{completed:0,retry:0,blocked:0,skipped:0},{completed:0,retry:0,blocked:0,skipped:0,backlog:{pending:-1}}]){body=invalid;assert.equal((await cleanup()).status,502);}
  }finally{globalThis.fetch=originals.fetch;console.info=originals.info;console.warn=originals.warn;if(originals.secret===undefined)delete process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET;else process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET=originals.secret;}
  console.log("PASS cleanup scheduler: fixed authenticated destination, absent configuration, aggregate health warnings, malformed-response guard and private logging.");
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:"Scheduler verification failed.");process.exitCode=1;});
