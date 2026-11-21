import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getDeployStore } from "@netlify/blobs";

/** Private, deploy-specific acceptance evidence; never the application's document store. */
export async function exportS18Artifacts(directory: string, run: string, deployId: string, commit: string) {
  assert.match(run, /^[a-f0-9-]{36}$/);
  assert.match(deployId, /^[a-f0-9]{24}$/);
  assert.match(commit, /^[a-f0-9]{40}$/);
  const siteId = "6b8c43fb-6083-450a-9b85-46a820fb6358";
  assert.equal(process.env.SITE_ID, siteId);
  const context = JSON.parse(Buffer.from(process.env.NETLIFY_BLOBS_CONTEXT || "", "base64").toString("utf8"));
  assert.equal(context.siteID, siteId);
  assert.equal(context.deployID, deployId);
  const names = (await readdir(directory)).sort();
  assert.ok(names.length >= 2 && names.length <= 20);
  const files: Array<{ name: string; bytes: Buffer; sha256: string }> = [];
  let total = 0;
  for (const name of names) {
    assert.match(name, /^(?:intent\.json|receipt\.json|(?:initial|replaced|withdrawn|access|plan)-(?:1440|375|320)\.png)$/);
    const target = path.join(directory, name);
    const stat = await lstat(target);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 10 * 1024 * 1024);
    total += stat.size;
    assert.ok(total <= 30 * 1024 * 1024);
    const bytes = await readFile(target);
    files.push({ name, bytes, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const store = getDeployStore({ name: "s18-acceptance", deployID: deployId,
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30000), redirect: "error" }) });
  const manifest = { run, deployId, commit, siteId, files: files.map(({ name, bytes, sha256 }) => ({ name, size: bytes.length, sha256 })) };
  for (const file of files) await store.set(`${run}/${file.name}`, new Uint8Array(file.bytes), { metadata: { sha256: file.sha256 } });
  // Write last: a missing manifest means evidence export is incomplete, never acceptance PASS.
  await store.setJSON(`${run}/manifest.json`, manifest);
  console.log(JSON.stringify({ gate: "s18-hosted", phase: "evidence-exported", run, deployId, files: files.length, bytes: total }));
}
