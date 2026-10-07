import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ExperiencePayloadError, NATIVE_EXPERIENCE_FILE_LIMIT, parseNativeExperienceEvidence } from "../lib/server/native-experience-evidence-payload";
const bytes = new TextEncoder().encode("%PDF-1.7 synthetic evidence");
const version = "2026-10-07T08:00:00.000Z", operationKey = "a".repeat(32);
function form(file = new File([bytes], "fixture.pdf", { type: "application/pdf" })) {
  const value = new FormData(); value.set("file", file); value.set("version", version); value.set("operationKey", operationKey); return value;
}
const request = (value: FormData) => new Request("https://example.invalid/upload", { method: "POST", body: value });
async function rejected(input: Request, status: number) {
  await assert.rejects(parseNativeExperienceEvidence(input), error => error instanceof ExperiencePayloadError && error.status === status);
}
async function main() {
  const valid = await parseNativeExperienceEvidence(request(form()));
  assert.equal(valid.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(valid.version, version); assert.equal(valid.operationKey, operationKey);
  for (const name of ["file", "version", "operationKey"]) {
    const missing = form(); missing.delete(name); await rejected(request(missing), 422);
    const duplicate = form(); duplicate.append(name, "duplicate"); await rejected(request(duplicate), 422);
  }
  const extra = form(); extra.set("storageKey", "foreign"); await rejected(request(extra), 422);
  const stale = form(); stale.set("version", "invalid"); await rejected(request(stale), 409);
  const key = form(); key.set("operationKey", "A".repeat(32)); await rejected(request(key), 422);
  for (const file of [new File([bytes], "wrong.png", {type:"image/png"}), new File([bytes], "wrong.png", {type:"application/pdf"}),
    new File([bytes], "../fixture.pdf", {type:"application/pdf"}), new File([], "empty.pdf", {type:"application/pdf"}),
    new File([bytes], "fixture.avif", {type:"image/avif"})]) await rejected(request(form(file)), 422);
  const large = new Uint8Array(NATIVE_EXPERIENCE_FILE_LIMIT + 1); large.set(bytes);
  await rejected(request(form(new File([large], "large.pdf", {type:"application/pdf"}))), 413);
  const maximum = new Uint8Array(NATIVE_EXPERIENCE_FILE_LIMIT); maximum.set(bytes);
  assert.equal((await parseNativeExperienceEvidence(request(form(new File([maximum], "maximum.pdf", {type:"application/pdf"}))))).file.size, maximum.length);
  for (const [name,type,signature] of [
    ["image.png","image/png",[137,80,78,71,13,10,26,10]],
    ["image.jpg","image/jpeg",[255,216,255,0]],
    ["image.webp","image/webp",[82,73,70,70,0,0,0,0,87,69,66,80]],
  ] as const) assert.equal((await parseNativeExperienceEvidence(request(form(new File([new Uint8Array(signature)],name,{type}))))).file.type,type);
  await rejected(new Request("https://example.invalid/upload",{method:"POST",headers:{"content-length":String(NATIVE_EXPERIENCE_FILE_LIMIT+65537)}}),413);
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(65536)); }, cancel() { canceled = true; } });
  const lying = new Request("https://example.invalid/upload", {method:"POST",body:stream,duplex:"half",headers:{"content-length":"1","content-type":"multipart/form-data; boundary=fixture"}} as RequestInit);
  await rejected(lying,413); assert.equal(canceled,true);
  await rejected(new Request("https://example.invalid/upload", {method:"POST",body:"malformed",headers:{"content-type":"multipart/form-data"}}),422);
  console.log("PASS native experience payload: exact fields, immutable operation/version, file signatures/names/types, 4 MiB boundary, lying length bounded and canceled, strict content digest.");
}
main().catch(error => {console.error(error);process.exitCode=1;});
