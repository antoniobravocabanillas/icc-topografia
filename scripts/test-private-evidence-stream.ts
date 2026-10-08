import assert from "node:assert/strict";
import { PrivateEvidenceReadError, readPrivateEvidenceStream } from "../lib/server/private-evidence-stream";

const store = (chunks: number[][]) => ({ getStream: async () => ({ data: new ReadableStream<Uint8Array>({ start(controller) {
  chunks.forEach(chunk => controller.enqueue(Uint8Array.from(chunk))); controller.close();
} }) }) });
const denied = (status: number, action: () => Promise<unknown>) => assert.rejects(action(),
  error => error instanceof PrivateEvidenceReadError && error.status === status);
async function main() {
assert.deepEqual(await readPrivateEvidenceStream(store([[1, 2], [3]]), "own", 3), Uint8Array.from([1, 2, 3]));
await denied(409, () => readPrivateEvidenceStream(store([[1, 2, 3, 4]]), "own", 3));
await denied(409, () => readPrivateEvidenceStream(store([[1, 2]]), "own", 3));
await denied(409, () => readPrivateEvidenceStream(store([]), "own", 4 * 1024 * 1024 + 1));
await denied(404, () => readPrivateEvidenceStream({ getStream: async () => null }, "own", 1));
let cancelled = false;
const start = performance.now();
await denied(504, () => readPrivateEvidenceStream({ getStream: async () => ({ data: new ReadableStream<Uint8Array>({
  pull: () => new Promise(() => undefined), cancel: () => { cancelled = true; return new Promise(() => undefined); },
}) }) }, "own", 1));
assert.ok(cancelled); assert.ok(performance.now() - start < 12000);
let deliver!: (value: { data: ReadableStream<Uint8Array> }) => void;
let lateCancelled = false;
await denied(504, () => readPrivateEvidenceStream({ getStream: () => new Promise(resolve => { deliver = resolve; }) }, "own", 1));
deliver({ data: new ReadableStream({ cancel() { lateCancelled = true; } }) });
await new Promise(resolve => setTimeout(resolve, 0)); assert.ok(lateCancelled);
console.log("PASS bounded private evidence stream: exact chunks, oversize/short/missing, read deadline with noncooperative cancel, acquisition deadline and late stream cancellation.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
