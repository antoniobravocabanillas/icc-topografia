import assert from "node:assert/strict";
import { EducationPayloadError, NATIVE_EDUCATION_FILE_LIMIT, parseNativeEducationEvidence } from "../lib/server/native-education-evidence-payload";
const bytes = new TextEncoder().encode("%PDF-1.7 own fixture");
const version = "2026-10-07T22:00:00.000Z", operationKey = "a".repeat(32);
function form(name = "propio.pdf", content = bytes, type = "application/pdf") {
  const data = new FormData(); data.set("file", new File([content], name, { type }));
  data.set("version", version); data.set("operationKey", operationKey); return data;
}
const request = (body: FormData) => new Request("https://example.invalid/upload", { method: "POST", body });
const denied = (value: Request, status: number) => assert.rejects(parseNativeEducationEvidence(value),
  error => error instanceof EducationPayloadError && error.status === status);
async function main() {
  const first = await parseNativeEducationEvidence(request(form()));
  assert.equal(first.file.size, bytes.length); assert.deepEqual(new Uint8Array(first.bytes), bytes);
  assert.equal((await parseNativeEducationEvidence(request(form()))).file.fingerprint, first.file.fingerprint);
  for (const field of ["file", "version", "operationKey"]) {
    const missing = form(); missing.delete(field); await denied(request(missing), 422);
    const duplicate = form(); duplicate.append(field, "duplicate"); await denied(request(duplicate), 422);
  }
  for (const field of ["owner", "storageKey", "fingerprint", "units"]) {
    const extra = form(); extra.set(field, "untrusted"); await denied(request(extra), 422);
  }
  for (const value of ["2026-10-07T22:00:00Z", "2026-02-30T22:00:00.000Z", "invalid"]) {
    const data = form(); data.set("version", value); await denied(request(data), 409);
  }
  const changed = form(); changed.set("version", "2026-10-07T22:00:00.001Z");
  assert.notEqual((await parseNativeEducationEvidence(request(changed))).file.fingerprint, first.file.fingerprint);
  assert.notEqual((await parseNativeEducationEvidence(request(form("otro.pdf")))).file.fingerprint, first.file.fingerprint);
  assert.notEqual((await parseNativeEducationEvidence(request(form("propio.pdf", new TextEncoder().encode("%PDF-1.8 changed"))))).file.fingerprint, first.file.fingerprint);
  for (const [name, content, type] of [["../propio.pdf", bytes, "application/pdf"], ["propio.png", bytes, "image/png"],
    ["empty.pdf", new Uint8Array(), "application/pdf"], ["x".repeat(177) + ".pdf", bytes, "application/pdf"]] as const)
    await denied(request(form(name, content, type)), 422);
  const max = new Uint8Array(NATIVE_EDUCATION_FILE_LIMIT); max.set(bytes);
  assert.equal((await parseNativeEducationEvidence(request(form("max.pdf", max)))).file.size, max.length);
  await denied(request(form("large.pdf", new Uint8Array(max.length + 1))), 413);
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(65536)); }, cancel() { canceled = true; } });
  await denied(new Request("https://example.invalid/upload", { method: "POST", body: stream, duplex: "half",
    headers: { "content-length": "1", "content-type": "multipart/form-data; boundary=own" } } as RequestInit), 413);
  assert.equal(canceled, true);
  const controller = new AbortController(); controller.abort();
  await denied(new Request("https://example.invalid/upload", { method: "POST", body: form(), signal: controller.signal }), 408);
  const stalled = new ReadableStream<Uint8Array>({ cancel() { return new Promise<void>(() => undefined); } });
  const started = Date.now();
  await denied(new Request("https://example.invalid/upload", { method: "POST", body: stalled, duplex: "half",
    headers: { "content-type": "multipart/form-data; boundary=own" } } as RequestInit), 408);
  assert.ok(Date.now() - started < 12000, "Uncooperative cancel cannot defeat the 10s read deadline");
  console.log("PASS education payload: strict fields/UTC-ms, server bytes+metadata+version fingerprint, names/signatures, 4 MiB and lying length, 10s stalled stream despite uncooperative cancel.");
}
main().catch(() => { console.error("Education payload test failed; diagnostics suppressed."); process.exitCode = 1; });
