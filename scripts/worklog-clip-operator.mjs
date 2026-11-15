import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { getStore } from "@netlify/blobs";
import { confirmSite } from "./s24-staging-blobs.mjs";
import { sanitizeWorklogClip } from "../lib/server/worklog-clip.ts";
import { verifyClipPlayback } from "./lib/worklog-clip-playback.ts";

const siteID = "6b8c43fb-6083-450a-9b85-46a820fb6358";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

async function cleanup(store, receipt) {
  const { run, worklogId, owner, assets } = receipt;
  assert.match(run, new RegExp("^" + uuid + "$"));
  assert.equal(owner, "clip-owner-" + run);
  assert.ok(/^c[a-z0-9]{24}$/.test(worklogId) || worklogId === "clip-probe-" + run);
  assert.ok(Array.isArray(assets) && assets.length <= 2);
  for (const { kind, key, size, sha256 } of assets) {
    assert.ok(kind === "audio" || kind === "video");
    assert.match(key, new RegExp("^worklog-evidence/" + worklogId + "/" + uuid + "-clip-" + run + "-" + kind + "\\.webm$"));
    assert.ok(Number.isSafeInteger(size) && size > 0 && size <= 3 * 1024 * 1024);
    const row = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (row) {
      assert.equal(row.metadata.worklogId, worklogId);
      assert.equal(row.metadata.uploadedBy, owner);
      assert.equal(row.metadata.originalName, `clip-${run}-${kind}.webm`);
      assert.equal(row.metadata.contentType, kind + "/webm");
      assert.equal(row.data.byteLength, size);
      if (sha256) assert.equal(digest(Buffer.from(row.data)), sha256);
      await store.delete(key);
    }
    assert.equal(await store.getMetadata(key), null);
    console.log("ABSENT", key);
  }
}

async function main() {
  assert.ok(!process.env.CI && process.env.NETLIFY !== "true", "Local operator only");
  const [action, path] = process.argv.slice(2);
  assert.ok((action === "cleanup" && path) || (action === "probe" && !path));
  const sdk = createRequire(new URL("../node_modules/netlify-cli/package.json", import.meta.url));
  const { getAPIToken } = await import(pathToFileURL(sdk.resolve("@netlify/dev-utils")).href);
  const { NetlifyAPI } = await import(pathToFileURL(sdk.resolve("@netlify/api")).href);
  const token = await getAPIToken();
  assert.ok(token);
  confirmSite(await new NetlifyAPI(token).getSite({ site_id: siteID }));
  const store = getStore({ name: "terraqo-worklog-evidence", siteID, token, consistency: "strong" });
  if (action === "cleanup") return cleanup(store, JSON.parse(await readFile(path, "utf8")));
  // Exercise the real staging store independently of which app commit it currently serves.
  const run = randomUUID(), worklogId = "clip-probe-" + run, owner = "clip-owner-" + run;
  const objects = [];
  for (const kind of ["audio", "video"]) {
    const originalName = `clip-${run}-${kind}.webm`;
    const source = Uint8Array.from(await readFile(new URL(`./fixtures/worklog-clips/${kind}.webm`, import.meta.url))).buffer;
    const { bytes, contentType } = await sanitizeWorklogClip(source, kind + "/webm", originalName);
    objects.push({ bytes, originalName, contentType, asset: { kind,
      key: `worklog-evidence/${worklogId}/${randomUUID()}-${originalName}`, size: bytes.length, sha256: digest(bytes) } });
  }
  const receipt = { run, worklogId, owner, assets: objects.map(object => object.asset) };
  const folder = "output/worklog-clips";
  await mkdir(folder, { recursive: true });
  const manifest = folder + "/" + run + ".json";
  await writeFile(manifest, JSON.stringify(receipt), { flag: "wx", flush: true });
  console.log("RECEIPT", manifest);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const { bytes, originalName, contentType, asset } of objects) {
      const write = await store.set(asset.key, Uint8Array.from(bytes).buffer, { onlyIfNew: true,
        metadata: { worklogId, uploadedBy: owner, originalName, contentType } });
      assert.equal(write.modified, true);
      const row = await store.getWithMetadata(asset.key, { type: "arrayBuffer" });
      assert.equal(digest(Buffer.from(row.data)), asset.sha256);
      const url = await page.evaluate(({ data, type }) => URL.createObjectURL(new Blob([new Uint8Array(data)], { type })),
        { data: [...new Uint8Array(row.data)], type: contentType });
      console.log("PLAYED", asset.kind, asset.size, await verifyClipPlayback(page, asset.kind, url));
    }
  } finally { try { await cleanup(store, receipt); } finally { await browser.close(); } }
}
main().catch(error => {
  console.error("Clip operator failed", error?.code || error?.name, error?.stack?.match(/worklog-clip-operator\.mjs:\d+:\d+/)?.[0] || "");
  process.exitCode = 1;
});
