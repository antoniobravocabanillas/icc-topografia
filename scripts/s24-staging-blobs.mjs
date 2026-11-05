import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getStore } from "@netlify/blobs";
import { s24BlobFixtures, s24BlobRun } from "./lib/s24-blob-fixtures.mjs";

const siteId = "6b8c43fb-6083-450a-9b85-46a820fb6358";
const branch = "codex/s22-evaluator-local";
const repo = "antoniobravocabanillas/icc-topografia";
const storeName = "terraqo-worklog-evidence";
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = path.join(root, "output", "s24-staging-blobs");
const states = ["preparing", "prepared", "cleaning", "cleaned"];

// Only our fixed diagnostics reach stderr. Provider and Git exceptions may contain credentials or signed URLs.
class OperatorError extends Error {}
function check(condition, message) {
  if (!condition) throw new OperatorError(message);
}
function candidateSha(value) {
  check(typeof value === "string" && value.length === 40 && /^[0-9a-f]{40}$/.test(value), "Expected a full lowercase commit SHA");
  return value;
}
function assetList(runId, mediaVersion) {
  return s24BlobFixtures(runId, mediaVersion).flat().map(({ key, bytes, sha256 }) => ({ key, size: bytes.length, sha256 }));
}
function validateManifest(manifest) {
  check(manifest?.siteId === siteId && manifest.branch === branch && manifest.store === storeName &&
    states.includes(manifest.state), "Manifest identity or lifecycle mismatch");
  candidateSha(manifest.candidate);
  s24BlobRun(manifest.runId);
  s24BlobRun(manifest.ownerId);
  check(JSON.stringify(manifest.assets) === JSON.stringify(assetList(manifest.runId, manifest.mediaVersion ?? 1)), "Manifest asset prefix or content mismatch");
  return manifest;
}
async function readManifest(dir) {
  try { return validateManifest(JSON.parse(await readFile(path.join(dir, "active.json"), "utf8"))); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function saveManifest(dir, manifest, state) {
  const next = validateManifest({ ...manifest, state });
  const temp = path.join(dir, `active-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify(next, null, 2) + "\n", { flag: "wx", mode: 0o600, flush: true });
    await rename(temp, path.join(dir, "active.json"));
  } finally { await rm(temp, { force: true }); }
  return next;
}
function metadata(manifest, asset) {
  return { s24Owner: manifest.ownerId, s24Run: manifest.runId, candidate: manifest.candidate, sha256: asset.sha256 };
}
async function readAsset(store, manifest, asset) {
  const row = await store.getWithMetadata(asset.key, { type: "arrayBuffer", consistency: "strong" });
  if (!row) return "absent";
  const expected = metadata(manifest, asset);
  if (!Object.entries(expected).every(([key, value]) => row.metadata?.[key] === value)) return "foreign";
  return Buffer.from(row.data).equals(asset.bytes) ? "verified" : "changed";
}
async function inspect(store, manifest) {
  const assets = [];
  for (const asset of s24BlobFixtures(manifest.runId, manifest.mediaVersion ?? 1).flat())
    assets.push({ key: asset.key, status: await readAsset(store, manifest, asset) });
  return assets;
}
async function cleanup(dir, store, manifest) {
  const cleaning = await saveManifest(dir, manifest, "cleaning");
  const failed = [];
  for (const asset of s24BlobFixtures(cleaning.runId, cleaning.mediaVersion ?? 1).flat()) {
    try {
      const status = await readAsset(store, cleaning, asset);
      if (status === "absent") continue;
      check(status === "verified", "Ownership or byte mismatch");
      // Only run-unique, manifest-owned keys are deletable. A lost delete reply
      // can be retried: strong absence is accepted and read back per exact key.
      try { await store.delete(asset.key); } catch { /* A lost reply is resolved by the strong read below. */ }
      check(await readAsset(store, cleaning, asset) === "absent", "Deleted key still present");
    } catch { failed.push(asset.key); }
  }
  check(!failed.length, `Cleanup incomplete for ${failed.length} key(s); active.json retained for inspect and retry`);
  return saveManifest(dir, cleaning, "cleaned");
}

// The lock serializes local prepare/inspect/cleanup. No object write precedes a durable owner manifest.
export async function blobOperation(command, { dir, store, candidate, expectedRun }) {
  await mkdir(dir, { recursive: true });
  const scope = createHash("sha256").update(await realpath(dir)).digest("hex").slice(0, 32);
  // A local IPC name is an exclusive OS lock. Windows named pipes and Linux
  // abstract sockets are released on process death, so cleanup can recover a preparing manifest.
  const name = `terraqo-s24-operator-${scope}`;
  const endpoint = process.platform === "win32" ? "\\\\.\\pipe\\" + name
    : process.platform === "linux" ? "\0" + name : path.join(tmpdir(), name + ".sock");
  const lock = createServer(socket => socket.destroy());
  try {
    await new Promise((resolve, reject) => { lock.once("error", reject); lock.listen(endpoint, resolve); });
  } catch { throw new OperatorError("Could not acquire the local S24 operator lock"); }
  try {
    const active = await readManifest(dir);
    if (command !== "prepare") {
      check(command === "inspect" || command === "cleanup", "Expected prepare, inspect or cleanup");
      check(active && (!expectedRun || active.runId === s24BlobRun(expectedRun)), "No matching active owner manifest");
      if (command === "inspect") return { ...active, readback: await inspect(store, active) };
      if (active.state === "cleaned") {
        check((await inspect(store, active)).every(row => row.status === "absent"), "Cleaned keys unexpectedly present");
        return active;
      }
      return cleanup(dir, store, active);
    }
    check(!active || active.state === "cleaned", "An active run already exists; inspect or clean it before preparing another");
    if (active) check((await inspect(store, active)).every(row => row.status === "absent"), "Previous run keys still present");
    const runId = randomUUID();
    const manifest = await saveManifest(dir, { siteId, branch, store: storeName, candidate: candidateSha(candidate),
      runId, ownerId: randomUUID(), mediaVersion: 2, assets: assetList(runId, 2) }, "preparing");
    try {
      for (const asset of s24BlobFixtures(runId).flat()) {
        const result = await store.set(asset.key, Uint8Array.from(asset.bytes).buffer,
          { onlyIfNew: true, metadata: metadata(manifest, asset) });
        check(result.modified === true, "Fixture key already exists");
        check(await readAsset(store, manifest, asset) === "verified", "Fixture byte or owner readback failed");
      }
      return await saveManifest(dir, manifest, "prepared");
    } catch {
      await cleanup(dir, store, manifest);
      throw new OperatorError("Prepare failed; all four manifest keys verified absent");
    }
  } finally { await new Promise(resolve => lock.close(resolve)); }
}

export function confirmCandidate(requested, git) {
  check(git(["branch", "--show-current"]) === branch, "Wrong local checkout branch");
  check(git(["status", "--porcelain", "--untracked-files=all"]) === "", "Prepare requires a clean checkout");
  const candidate = candidateSha(git(["rev-parse", "HEAD"]));
  check(requested === undefined || requested === candidate, "Requested candidate differs from local HEAD");
  const url = git(["remote", "get-url", "origin"]);
  check([`https://github.com/${repo}`, `https://github.com/${repo}.git`, `git@github.com:${repo}.git`,
    `ssh://git@github.com/${repo}.git`].includes(url), "Unexpected origin repository");
  const ref = `refs/heads/${branch}`;
  check(git(["ls-remote", "--exit-code", "--refs", "origin", ref]) === `${candidate}\t${ref}`, "Remote branch differs from local HEAD");
  return candidate;
}
export function confirmSite(site) {
  check(site.id === siteId && site.name === "terraqo-platform-staging" &&
    site.ssl_url === "https://terraqo-platform-staging.netlify.app" &&
    site.build_settings?.repo_path === repo && site.build_settings?.repo_branch === branch,
  "Staging site, repository or configured branch mismatch");
}
async function main() {
  const [command, argument, ...extra] = process.argv.slice(2);
  check(["prepare", "inspect", "cleanup"].includes(command) && !extra.length,
    "Usage: node scripts/s24-staging-blobs.mjs prepare [candidate] | inspect [runId] | cleanup [runId]");
  check(!process.env.NETLIFY && !process.env.CI, "Local operator only");
  const git = args => execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8",
    windowsHide: true, timeout: 30000 }).trim();
  git(["check-ignore", "-q", "--", "output/s24-staging-blobs/active.json"]);
  const candidate = command === "prepare" ? confirmCandidate(argument, git) : undefined;
  const expectedRun = command === "prepare" ? undefined : argument ?? process.env.PLATFORM_STAGING_S24_BLOB_RUN;
  if (expectedRun !== undefined) s24BlobRun(expectedRun);
  const sdk = createRequire(new URL("../node_modules/netlify-cli/package.json", import.meta.url));
  const { getAPIToken } = await import(pathToFileURL(sdk.resolve("@netlify/dev-utils")).href);
  const { NetlifyAPI } = await import(pathToFileURL(sdk.resolve("@netlify/api")).href);
  const token = await getAPIToken();
  check(typeof token === "string" && token.length > 0, "Local Netlify CLI login required");
  confirmSite(await new NetlifyAPI(token).getSite({ site_id: siteId }));
  const store = getStore({ siteID: siteId, name: storeName, token, consistency: "strong" });
  const receipt = await blobOperation(command, { dir: directory, store, candidate, expectedRun });
  console.log(JSON.stringify({ siteId, branch, candidate: receipt.candidate, runId: receipt.runId, state: receipt.state,
    assets: receipt.assets, readback: receipt.readback, manifest: "output/s24-staging-blobs/active.json" }));
  if (command === "inspect" && ["prepared", "cleaned"].includes(receipt.state)) {
    const expected = receipt.state === "prepared" ? "verified" : "absent";
    check(receipt.readback.every(asset => asset.status === expected), "Remote readback differs from manifest state");
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  main().catch(error => {
    console.error(error instanceof OperatorError ? error.message : "Operator command failed; inspect active.json before retrying");
    process.exitCode = 1;
  });
