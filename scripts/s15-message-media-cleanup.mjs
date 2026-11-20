import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, stat, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getStore } from "@netlify/blobs";
import { s24BlobFixtures } from "./lib/s24-blob-fixtures.mjs";

const siteId = "6b8c43fb-6083-450a-9b85-46a820fb6358";
async function main() {
  assert.ok(!process.env.NETLIFY && !process.env.CI, "Local operator only");
  const [receiptPath, confirmation, ...extra] = process.argv.slice(2);
  assert.equal(confirmation, "--confirm=synthetic-s15-only");
  assert.equal(extra.length, 0);
  assert.ok(receiptPath && (await stat(receiptPath)).size <= 65_536);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(receipt.gate, "s15");
  assert.equal(receipt.phase, "media-operator-required");
  assert.equal(receipt.siteId, siteId);
  assert.match(receipt.commit, /^[a-f0-9]{40}$/);
  assert.match(receipt.deployId, /^[a-f0-9]{24}$/);
  const media = receipt.mediaCleanup;
  assert.equal(media.state, "operator-required");
  assert.match(media.run, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
  assert.ok(Array.isArray(media.objects) && media.objects.length > 0 && media.objects.length <= 4);
  const manifest = JSON.parse(await readFile("output/s24-staging-blobs/active.json", "utf8"));
  assert.equal(manifest.siteId, siteId);
  assert.equal(manifest.candidate, receipt.commit);
  const [[plan]] = s24BlobFixtures(manifest.runId);
  const keys = new Set();
  for (const object of media.objects) {
    assert.match(object.conversationId, /^[a-z0-9]{20,40}$/);
    assert.equal(object.uploadedBy, "s13-public-" + media.run);
    assert.equal(object.sha256, plan.sha256);
    const prefix = `message-attachments/${object.conversationId}/`;
    assert.ok(object.storageKey.startsWith(prefix));
    const tail = object.storageKey.slice(prefix.length);
    assert.match(tail, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}-s15-/);
    assert.ok(tail.endsWith(`-s15-${media.run}.webp`) && !tail.includes("/"));
    assert.ok(!keys.has(object.storageKey));
    keys.add(object.storageKey);
  }
  const sdk = createRequire(new URL("../node_modules/netlify-cli/package.json", import.meta.url));
  const { getAPIToken } = await import(pathToFileURL(sdk.resolve("@netlify/dev-utils")).href);
  const { NetlifyAPI } = await import(pathToFileURL(sdk.resolve("@netlify/api")).href);
  const token = await getAPIToken(), api = new NetlifyAPI(token);
  const site = await api.getSite({ site_id: siteId });
  assert.equal(site.name, "terraqo-platform-staging");
  assert.equal(site.ssl_url, "https://terraqo-platform-staging.netlify.app");
  const deploy = await api.getSiteDeploy({ site_id: siteId, deploy_id: receipt.deployId });
  assert.equal(deploy.site_id, siteId);
  assert.equal(deploy.commit_ref, receipt.commit);
  assert.equal(deploy.branch, "codex/s22-evaluator-local");
  const store = getStore({ siteID: siteId, token, name: "terraqo-message-attachments", consistency: "strong" });
  // Check every object before the first delete. Missing objects allow an exact retry.
  for (const object of media.objects) {
    const entry = await store.getWithMetadata(object.storageKey, { type: "arrayBuffer", consistency: "strong" });
    if (!entry) continue;
    assert.equal(entry.metadata.uploadedBy, object.uploadedBy);
    assert.equal(entry.metadata.conversationId, object.conversationId);
    assert.equal(createHash("sha256").update(Buffer.from(entry.data)).digest("hex"), plan.sha256);
  }
  for (const object of media.objects) {
    await store.delete(object.storageKey);
    assert.equal(await store.getWithMetadata(object.storageKey, { type: "arrayBuffer", consistency: "strong" }), null);
  }
  const result = { gate: "s15-media-cleanup", passed: true, siteId, commit: receipt.commit,
    deployId: receipt.deployId, run: media.run, absent: media.objects.length };
  await writeFile(receiptPath + ".cleaned.json", JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error("S15 media cleanup rejected or incomplete; keep the receipt and inspect before retrying."); process.exitCode = 1; });
