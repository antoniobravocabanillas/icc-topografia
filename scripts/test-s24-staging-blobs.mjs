import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { blobOperation, confirmCandidate, confirmSite } from "./s24-staging-blobs.mjs";
import { s24BlobFixtures, s24BlobRun } from "./lib/s24-blob-fixtures.mjs";

const candidate = "a".repeat(40);
const branch = "codex/s22-evaluator-local";
const repo = "antoniobravocabanillas/icc-topografia";
const ref = "refs/heads/" + branch;
const site = { id: "6b8c43fb-6083-450a-9b85-46a820fb6358", name: "terraqo-platform-staging",
  ssl_url: "https://terraqo-platform-staging.netlify.app", build_settings: { repo_path: repo, repo_branch: branch } };
confirmSite(site);
assert.throws(() => confirmSite({ ...site, id: randomUUID() }));
assert.throws(() => confirmSite({ ...site, build_settings: { repo_path: repo, repo_branch: "main" } }));
const git = { branch, status: "", "rev-parse": candidate, remote: "https://github.com/" + repo + ".git",
  "ls-remote": `${candidate}\t${ref}` };
const gitResult = values => ([op]) => values[op];
assert.equal(confirmCandidate(candidate, gitResult(git)), candidate);
for (const change of [{ branch: "main" }, { status: "?? extra.txt" }, { remote: "another-repository" },
  { "ls-remote": `${"b".repeat(40)}\t${ref}` }]) assert.throws(() => confirmCandidate(candidate, gitResult({ ...git, ...change })));
assert.throws(() => confirmCandidate("b".repeat(40), gitResult(git)));
for (const invalid of [null, "../x", "0".repeat(36), randomUUID().toUpperCase()]) assert.throws(() => s24BlobRun(invalid));

const dir = await mkdtemp(path.join(os.tmpdir(), "s24-operator-test-"));
const file = path.join(dir, "active.json");
const active = async () => JSON.parse(await readFile(file, "utf8"));
const objects = new Map();
let afterPut, failDelete, lostDeleteReply;
const store = {
  async set(key, data, options) {
    assert.equal(options.onlyIfNew, true);
    const manifest = await active();
    assert.equal(manifest.state, "preparing", "Persist cleanup ownership before writes");
    assert.ok(manifest.assets.some(asset => asset.key === key));
    if (objects.has(key)) return { modified: false };
    objects.set(key, { data, metadata: options.metadata });
    await afterPut?.(key);
    return { modified: true };
  },
  async getWithMetadata(key, options) {
    assert.equal(options.consistency, "strong");
    return objects.get(key) ?? null;
  },
  async delete(key) {
    if (key === failDelete) throw Error("synthetic deletion failure");
    objects.delete(key);
    if (key === lostDeleteReply) throw Error("lost delete reply");
  },
};
const operate = (command, expectedRun) => blobOperation(command, { dir, store, candidate, expectedRun });
try {
  const prepared = await operate("prepare");
  assert.equal(prepared.state, "prepared");
  assert.equal(s24BlobRun(prepared.runId), prepared.runId);
  assert.equal(prepared.siteId, site.id);
  assert.equal(prepared.candidate, candidate);
  assert.equal(prepared.branch, branch);
  const assets = s24BlobFixtures(prepared.runId).flat();
  assert.equal(assets.length, 4);
  assert.equal(new Set(assets.map(asset => asset.sha256)).size, 4);
  for (const asset of assets) {
    const image = await sharp(asset.bytes).metadata();
    assert.equal(image.format, "webp");
    assert.equal(image.width, asset.key.endsWith("-selected.webp") ? 960 : 4);
    assert.equal(image.height, asset.key.endsWith("-selected.webp") ? 540 : 4);
    assert.deepEqual(Buffer.from(objects.get(asset.key).data), asset.bytes);
  }
  const original = await readFile(file, "utf8");
  await assert.rejects(operate("prepare"), /active run/);
  const inspected = await operate("inspect");
  assert.deepEqual(inspected.readback.map(row => row.status), Array(4).fill("verified"));
  assert.equal(await readFile(file, "utf8"), original);
  await assert.rejects(operate("cleanup", randomUUID()), /matching active/);
  const tampered = JSON.parse(original);
  tampered.assets[0].key = "elsewhere";
  await writeFile(file, JSON.stringify(tampered));
  await assert.rejects(operate("cleanup"), /prefix or content mismatch/);
  assert.equal(objects.size, 4);
  await writeFile(file, original);
  // A foreign replacement or an interrupted delete cannot authorize another key.
  const own = objects.get(assets[0].key);
  objects.set(assets[0].key, { ...own, metadata: {} });
  failDelete = assets[1].key;
  lostDeleteReply = assets[2].key;
  await assert.rejects(operate("cleanup"), /2 key\(s\)/);
  assert.equal((await active()).state, "cleaning");
  assert.deepEqual((await operate("inspect")).readback.map(row => row.status), ["foreign", "verified", "absent", "absent"]);
  await assert.rejects(operate("prepare"), /active run/);
  failDelete = undefined;
  objects.set(assets[0].key, { ...own, data: new Uint8Array([42]).buffer });
  assert.equal((await operate("inspect")).readback[0].status, "changed");
  await assert.rejects(operate("cleanup"), /1 key\(s\)/);
  assert.equal(objects.size, 1);
  objects.set(assets[0].key, own);
  assert.equal((await operate("cleanup", prepared.runId)).state, "cleaned");
  assert.equal((await operate("cleanup", prepared.runId)).state, "cleaned");
  assert.equal(objects.size, 0);
  afterPut = () => { throw Error("lost successful write response"); };
  await assert.rejects(operate("prepare"), /verified absent/);
  assert.equal(objects.size, 0);
  assert.equal((await active()).state, "cleaned");
  // Simulate a crash after the write but before publishing the prepared state.
  afterPut = undefined;
  const second = await operate("prepare");
  assert.notEqual(second.runId, prepared.runId);
  await writeFile(file, JSON.stringify({ ...second, state: "preparing" }));
  await operate("cleanup", second.runId);
  assert.equal(objects.size, 0);
  console.log("PASS local S24 operator contract: target and commit guards, four canonical WebPs, durable ownership, exact readback, foreign/tampered denial, partial failure recovery and repeated cleanup.");
} finally {
  // The direct child is created by mkdtemp above and contains only the test manifest.
  assert.equal(path.dirname(dir), os.tmpdir());
  await rm(file, { force: true });
  await rmdir(dir);
}
