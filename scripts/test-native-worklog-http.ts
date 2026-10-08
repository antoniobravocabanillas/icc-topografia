import assert from "node:assert/strict";
import { handleNativeWorklogOperation, NativeWorklogOperationError, type NativeWorklogOperationResult } from "../lib/server/native-worklog-http";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

const key="a".repeat(32), slug="icc-topografia";
const token:WorkspacePortalToken={sub:"own-test-user",workspaceId:"own-test-workspace",workspaceSlug:slug,role:"PROFESSIONAL",iat:1,exp:Math.floor(Date.now()/1000)+3600,jti:"11111111-1111-4111-8111-111111111111"};
const payload={operationKey:key,title:"Trabajo de campo",summary:"Resumen propio del trabajo técnico.",outcome:"",type:"FIELD_UPDATE",projectId:"",projectVersion:""};
const result:NativeWorklogOperationResult={receipt:{operationKey:key,worklogId:"own-test-worklog",createdAt:new Date("2026-10-07T00:00:00.000Z"),originalProjectVersion:null},current:{worklogId:"own-test-worklog",version:"2026-10-07T00:00:00.001Z"}};
const request=(method="POST",query="",body=JSON.stringify(payload))=>new Request("https://example.invalid/worklogs"+query,{method,headers:{"content-type":"application/json"},...(method==="POST"?{body}:{})});
async function main() {
  let authCalls=0,bodyReads=0,createCalls=0,readCalls=0;
  const ports={authenticate:async()=>{authCalls++;return token;},create:async(input: {payload: typeof payload},actor:WorkspacePortalToken)=>{createCalls++;assert.equal(actor,token);assert.equal(input.payload.operationKey,key);return result;},read:async(actor:WorkspacePortalToken,operationKey:string)=>{readCalls++;assert.equal(actor,token);assert.equal(operationKey,key);return result;}};
  for (const authToken of [null,{...token,jti:undefined},{...token,role:"CLIENT" as const},{...token,exp:0},{...token,exp:NaN},{...token,workspaceSlug:"other-own"}]) {
    const blocked=request(); Object.defineProperty(blocked,"body",{get(){bodyReads++;throw Error("Body access before authority");}});
    const response=await handleNativeWorklogOperation(blocked,slug,{...ports,authenticate:async()=>authToken});assert.equal(response.status,401);
  }
  assert.equal(bodyReads,0);assert.equal(createCalls,0);
  for (const [input,badSlug,status] of [[request("PUT"),slug,405],[request(),"../icc",404],[request("POST","?owner=x"),slug,422],[request("GET","?operationKey="+key+"&operationKey="+key),slug,422],[request("GET","?operationKey="+key+"&owner=x"),slug,422],[request("GET"),slug,422]] as const) {
    const response=await handleNativeWorklogOperation(input,badSlug,ports);assert.equal(response.status,status);if(status===405)assert.equal(response.headers.get("allow"),"GET, POST");
  }
  assert.equal(authCalls,0);
  const response=await handleNativeWorklogOperation(request(),slug,ports);assert.equal(response.status,200);assert.equal(createCalls,1);
  assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("x-content-type-options"),"nosniff");
  const data=(await response.json()).data;assert.equal(data.receipt.outcome,"CREATED");assert.equal(data.current.version,result.current?.version);
  assert.deepEqual(Object.keys(data.receipt).sort(),["operationKey","worklogId","outcome","createdAt","originalProjectVersion"].sort());
  const enriched={...result,actor:"hidden",fingerprint:"hidden",points:99,receipt:{...result.receipt!,actor:"hidden",fingerprint:"hidden",storageKey:"hidden"},current:{...result.current!,bank:"hidden",summary:"hidden"}};
  const projected=await handleNativeWorklogOperation(request("GET","?operationKey="+key),slug,{...ports,read:async()=>enriched});assert.ok(!JSON.stringify(await projected.json()).includes("hidden"));
  const historical=await handleNativeWorklogOperation(request("GET","?operationKey="+key),slug,{...ports,read:async()=>({...result,current:null})});assert.equal((await historical.json()).data.current,null);
  const nullRead=await handleNativeWorklogOperation(request("GET","?operationKey="+key),slug,{...ports,read:async()=>({receipt:null,current:null})});assert.deepEqual((await nullRead.json()).data,{receipt:null,current:null});assert.equal(createCalls,1);
  await handleNativeWorklogOperation(request("GET","?operationKey="+key),slug,ports);assert.equal(readCalls,1);assert.equal(createCalls,1);
  for (const status of [401,403,404,409,429,503] as const) {
    const failed=await handleNativeWorklogOperation(request(),slug,{...ports,create:async()=>{throw new NativeWorklogOperationError(status);}});
    assert.equal(failed.status,status);assert.equal(failed.headers.get("cache-control"),"private, no-store");assert.equal(failed.headers.get("x-content-type-options"),"nosniff");
  }
  const opaque=await handleNativeWorklogOperation(request(),slug,{...ports,create:async()=>{throw Error("private internal diagnostic");}});assert.equal(opaque.status,503);assert.ok(!(await opaque.text()).includes("private internal"));
  const wrongReceipt=await handleNativeWorklogOperation(request(),slug,{...ports,create:async()=>({...result,receipt:{...result.receipt!,operationKey:"b".repeat(32)}})});assert.equal(wrongReceipt.status,503);
  const wrongHistory=await handleNativeWorklogOperation(request("GET","?operationKey="+key),slug,{...ports,read:async()=>({...result,receipt:{...result.receipt!,operationKey:"b".repeat(32)}})});assert.equal(wrongHistory.status,503);
  const noReceipt=await handleNativeWorklogOperation(request(),slug,{...ports,create:async()=>({receipt:null,current:null})});assert.equal(noReceipt.status,503);
  console.log("PASS preparatory native worklog boundary: auth before body, legacy/method/query gates, minimal history/current DTO, null without POST and private errors; controlled ports only, no endpoint/SQL/points.");
}
main().catch(()=>{console.error("FAIL preparatory native worklog boundary (diagnostics suppressed).");process.exitCode=1;});
