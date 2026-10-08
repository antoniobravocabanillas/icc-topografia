import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { NativeWorklogPayloadError, NATIVE_WORKLOG_BODY_LIMIT, parseNativeWorklogPayload, type NativeWorklogPayload } from "../lib/server/native-worklog-payload";

const base: NativeWorklogPayload = { operationKey: "a".repeat(32), title: "Levantamiento propio", summary: "Control de puntos del trabajo de campo.", outcome: "Cotas contrastadas.", type: "FIELD_UPDATE", projectId: "", projectVersion: "" };
function request(body: string | Uint8Array, headers: Record<string, string> = {}) {
  return new Request("https://example.invalid/native-worklog", {method:"POST", headers:{"content-type":"application/json", ...headers}, body:typeof body === "string" ? body : Buffer.from(body)});
}
const encode = (values: object) => request(JSON.stringify(values));
async function rejects(input: Request, status = 422) {
  await assert.rejects(parseNativeWorklogPayload(input), error => error instanceof NativeWorklogPayloadError && error.status === status);
}
async function main() {
  const parsed = await parseNativeWorklogPayload(encode(base));
  assert.deepEqual(parsed.payload, base); assert.ok(Object.isFrozen(parsed.payload)); assert.ok(Object.isFrozen(parsed));
  const reordered = await parseNativeWorklogPayload(encode(Object.fromEntries(Object.entries(base).reverse())));
  assert.equal(reordered.fingerprint, parsed.fingerprint);
  const newKey = await parseNativeWorklogPayload(encode({...base, operationKey:"b".repeat(32)}));
  assert.equal(newKey.fingerprint, parsed.fingerprint); // Durable scope/key uniqueness belongs to the service, not this digest.
  for (const changed of [{title:"Otro levantamiento"}, {summary:base.summary+" Revisado."}, {outcome:"Otro resultado"}, {type:"LEARNING"}]) {
    assert.notEqual((await parseNativeWorklogPayload(encode({...base,...changed}))).fingerprint, parsed.fingerprint);
  }
  const project = {...base, projectId:"c"+"a".repeat(24), projectVersion:"2026-10-07T20:30:00.001Z"};
  const projectParsed = await parseNativeWorklogPayload(encode(project)); assert.notEqual(projectParsed.fingerprint, parsed.fingerprint);
  assert.notEqual((await parseNativeWorklogPayload(encode({...project,projectVersion:"2026-10-07T20:30:00.002Z"}))).fingerprint, projectParsed.fingerprint);
  assert.notEqual((await parseNativeWorklogPayload(encode({...project,projectId:"c"+"b".repeat(24)}))).fingerprint, projectParsed.fingerprint);
  const multiline = {...base,summary:"Control\nsegunda línea\tde campo."}; assert.deepEqual((await parseNativeWorklogPayload(encode(multiline))).payload, multiline);
  for (const extra of ["owner", "workspaceId", "storageKey", "hash", "fingerprint", "points", "visibility", "evidenceUrls", "previousWorklogId", "skills", "latitude"]) await rejects(encode({...base,[extra]:"x"}));
  for (const invalid of [{title:"abc"}, {title:"x".repeat(181)}, {summary:"x".repeat(19)}, {summary:"x".repeat(2401)}, {outcome:"x".repeat(801)}, {title:" inicio"}, {summary:base.summary+" "}, {title:"línea\npartida"}, {summary:"Texto de prueba\u0000oculto"}, {title:"Test\ud800"}, {type:"UNKNOWN"}, {operationKey:"A".repeat(32)}, {operationKey:"a".repeat(31)}, {projectVersion:project.projectVersion}, {projectId:project.projectId}, {projectId:"../../project"}, {projectId:project.projectId,projectVersion:"2026-02-30T00:00:00.000Z"}, {projectId:project.projectId,projectVersion:"2026-10-07T20:30:00Z"}, {summary:null}, {type:3}]) await rejects(encode({...base,...invalid}));
  const text=JSON.stringify(base);
  for (const malformed of [text.slice(0,-1)+',"title":"duplicado"}',text.replace('"title":','"t\\u0069tle":"duplicado","title":'), text.slice(0,-1)+',}', text+" {}", "[]", "{}", text.replace('"summary":','"__proto__":')]) await rejects(request(malformed));
  const escaped = text.replace('"title":','"t\\u0069tle":'); assert.equal((await parseNativeWorklogPayload(request(escaped))).fingerprint, parsed.fingerprint);
  await rejects(request(new Uint8Array([0xff,0xfe])));
  await rejects(request(text,{"content-type":"text/plain"}),415);
  await rejects(request(text,{"content-length":"bad"}));
  await rejects(request(text,{"content-length":String(NATIVE_WORKLOG_BODY_LIMIT+1)}),413);
  await rejects(request(text+" ".repeat(NATIVE_WORKLOG_BODY_LIMIT),{"content-length":"1"}),413);
  const atLimit = text+" ".repeat(NATIVE_WORKLOG_BODY_LIMIT-Buffer.byteLength(text));
  assert.equal((await parseNativeWorklogPayload(request(atLimit))).fingerprint, parsed.fingerprint);
  const cancelled = new AbortController(); cancelled.abort(); await rejects(new Request("https://example.invalid/",{method:"POST",headers:{"content-type":"application/json"},body:text,signal:cancelled.signal}),408);
  const during = new AbortController(); let reading!: () => void;
  const began = new Promise<void>(resolve=>{reading=resolve;});
  const blocked = new ReadableStream<Uint8Array>({pull(){reading();return new Promise<void>(()=>{});},cancel(){return new Promise<void>(()=>{});}});
  const inFlight = new Request("https://example.invalid/",{method:"POST",headers:{"content-type":"application/json"},body:blocked,signal:during.signal,duplex:"half"} as RequestInit);
  const rejection = rejects(inFlight,408); await began; during.abort(); await rejection;
  // A real deadline and non-cooperative cancel; no DB, store, credentials or external requests.
  let cancelCalled = false;
  const stream = new ReadableStream<Uint8Array>({pull(){return new Promise<void>(()=>{});},cancel(){cancelCalled=true;return new Promise<void>(()=>{});}});
  const stalled = new Request("https://example.invalid/",{method:"POST",headers:{"content-type":"application/json"},body:stream,duplex:"half"} as RequestInit);
  const started = performance.now(); await rejects(stalled,408); assert.ok(performance.now()-started<6500); assert.ok(cancelCalled);
  console.log("PASS native worklog payload: strict duplicate-safe JSON, UTF8/limits/deadline/abort, immutable exact snapshot and complete canonical digest; no SQL/store/points/routes.");
}
main().catch(()=>{console.error("FAIL native worklog payload checks (private diagnostics suppressed).");process.exitCode=1;});
