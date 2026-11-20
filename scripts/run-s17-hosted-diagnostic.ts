import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as origin,
  workspaceAdministrationStagingSite as site, workspaceAdministrationStagingProject as project } from "./lib/workspace-administration-test-target";
import { migrationSourceChecksums } from "./lib/migration-source-checksums";
import { s24BlobRun } from "./lib/s24-blob-fixtures.mjs";

const servedCommit = "ab8b64f23d5262c28eab417771124bff8ac35190";
const servedDeploy = "6b002b7657e67f04e799cbec";
const target = `${servedCommit}/${servedDeploy}`;
const servedWorkspace = `s13-need-${servedCommit.slice(0, 16)}`;
const marker = { kind: "workspace-administration", siteId: site, commit: servedCommit, deployId: servedDeploy };
const noPublishExit = 42;
const screenshotFiles = ["private-certificate-professional-375.png", "protected-reference-company-1440.png"] as const;
const screenshotRoot = resolve("output/playwright/s16");
const imageLimit = 1_500_000;

function screenshotChunks(run: string, file: string, bytes: Buffer) {
  s24BlobRun(run);
  assert.ok(screenshotFiles.some(name => name === file));
  assert.ok(bytes.length > 8 && bytes.length <= imageLimit);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const base64 = bytes.toString("base64"), sha256 = createHash("sha256").update(bytes).digest("hex");
  const total = Math.ceil(base64.length / 3000);
  return Array.from({ length: total }, (_, index) => {
    const entry = { gate: "s17-hosted-screenshot", run, file, sha256, bytes: bytes.length,
      encoding: "base64", index, total, data: base64.slice(index * 3000, (index + 1) * 3000) };
    assert.ok(JSON.stringify(entry).length <= 4000);
    return entry;
  });
}

async function screenshotRuns(): Promise<string[]> {
  try {
    const stat = await lstat(screenshotRoot);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    return await readdir(screenshotRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function freshScreenshotRun(before: string[], after: string[]) {
  const fresh = after.filter(name => !before.includes(name));
  assert.equal(fresh.length, 1);
  return s24BlobRun(fresh[0]);
}

async function exportScreenshots(before: string[], log: Dependencies["log"]) {
  const run = freshScreenshotRun(before, await screenshotRuns());
  const directory = resolve(screenshotRoot, run), stat = await lstat(directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  // Validate both whitelisted images before emitting any bytes. No glob, arbitrary path, or stale run.
  const chunks = [];
  for (const file of screenshotFiles) {
    const path = resolve(directory, file), entry = await lstat(path);
    assert.ok(entry.isFile() && !entry.isSymbolicLink() && entry.size <= imageLimit);
    const handle = await open(path, "r");
    try {
      const opened = await handle.stat();
      assert.ok(opened.isFile() && opened.size <= imageLimit);
      const buffer = Buffer.alloc(imageLimit + 1);
      let size = 0;
      while (size < buffer.length) {
        const result = await handle.read(buffer, size, buffer.length - size, size);
        if (!result.bytesRead) break;
        size += result.bytesRead;
      }
      assert.equal(size, opened.size);
      chunks.push(...screenshotChunks(run, file, buffer.subarray(0, size)));
    } finally { await handle.close(); }
  }
  for (const chunk of chunks) log(chunk);
  log({ gate: "s17-hosted-screenshot", run, exportComplete: true, files: screenshotFiles, uxPass: false });
}

type Environment = Record<string, string | undefined>;
type Dependencies = {
  head: () => string;
  preflight: (env: Environment, commit: string) => Promise<void>;
  fetch: typeof fetch;
  verify: () => Promise<void>;
  screenshotRuns?: typeof screenshotRuns;
  exportScreenshots?: typeof exportScreenshots;
  log: (entry: Record<string, unknown>) => void;
};

function guard(env: Environment, commit: string) {
  assert.equal(env.NETLIFY, "true");
  assert.equal(env.CONTEXT, "production"); // Production context of the isolated staging site.
  assert.equal(env.BRANCH, "codex/s17-staging-7302dba");
  assert.equal(env.S17_HOSTED_DIAGNOSTIC_TARGET, target);
  assert.equal(env.PLATFORM_STAGING_CLOUD_PHASE, "workspace-administration");
  assert.equal(assertWorkspaceAdministrationTestTarget(env, origin), "staging");
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.equal(env.COMMIT_REF, commit);
  assert.equal(env.S22_STAGING_CANDIDATE_SHA, commit);
  assert.notEqual(commit, servedCommit);
  assert.match(env.DEPLOY_ID ?? "", /^[a-f0-9]{24}$/);
  assert.notEqual(env.DEPLOY_ID, servedDeploy);
  assert.equal(env.S16_COLLABORATION_GATE, "synthetic-only");
  assert.equal(env.S16_ORIGIN, origin);
  assert.equal(env.S16_EXCLUSIVE_FIXTURE_WORKSPACE, `s13-need-${commit.slice(0, 16)}`);
  assert.ok((env.TERRAQO_B5_PILOT_WORKSPACE_IDS ?? "").split(",").map(x => x.trim()).includes(servedWorkspace));
  assert.equal(env.S17_HOSTED_DIAGNOSTIC_MEDIA_RUN, s24BlobRun(env.PLATFORM_STAGING_S24_BLOB_RUN));
  for (const key of ["S24_STAGING_DIAGNOSTIC_TARGET", "S24_STAGING_RECOVER_INTERRUPTED"])
    assert.ok(env[key] === undefined || env[key] === "off");
  for (const key of ["TERRAQO_WORKSPACE_EVALUATORS_V1", "TERRAQO_DISCOVERY_NEEDS_V1",
    "TERRAQO_SCOPED_SHARING_V1", "TERRAQO_CONTEXTUAL_MESSAGING_V1", "TERRAQO_COLLABORATION_V1", "TERRAQO_CLOSURE_V1"])
    assert.equal(env[key], "true");
}

const liveDependencies: Dependencies = {
  head: () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
  async preflight(env, commit) {
    for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) assert.ok(!existsSync(file));
    // The ordinary onPreBuild hook must have completed for THIS build identity.
    assert.deepEqual(JSON.parse(await readFile("public/__terraqo_s22_candidate.json", "utf8")),
      { kind: "workspace-administration", siteId: site, commit, deployId: env.DEPLOY_ID });
    // A diagnostic commit may change only this wrapper and its build-command router.
    // In particular the real journey and the served application must remain identical.
    const changes = execFileSync("git", ["diff", "--name-only", servedCommit, commit], { encoding: "utf8", windowsHide: true }).trim();
    assert.ok(changes && changes.split(/\r?\n/).every(file =>
      ["scripts/run-s17-hosted-diagnostic.ts", "plugins/terraqo-staging-gate/index.cjs"].includes(file)));
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
    try {
      assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database,
        has_schema_privilege('anon','icc','USAGE') OR has_schema_privilege('authenticated','icc','USAGE') OR
        has_schema_privilege('service_role','icc','USAGE') AS exposed`,
      [{ role: "terraqo_staging_runtime", database: "postgres", exposed: false }]);
      // SELECT only; include migration 49, beyond the normal S22 gate's five ledger checks.
      const names = (await readdir("prisma/migrations", { withFileTypes: true }))
        .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
      assert.equal(names.length, 49);
      const rows = await db.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
        SELECT migration_name, checksum, finished_at, rolled_back_at FROM icc._prisma_migrations ORDER BY migration_name`;
      assert.deepEqual(rows.map(row => row.migration_name), names);
      for (const row of rows) {
        assert.ok(row.finished_at && !row.rolled_back_at);
        assert.ok(migrationSourceChecksums(await readFile(`prisma/migrations/${row.migration_name}/migration.sql`)).has(row.checksum));
      }
    } finally { await db.$disconnect(); }
  },
  fetch: (...args) => fetch(...args),
  verify: async () => { const { verifyS16Collaboration } = await import("./verify-s16-collaboration"); await verifyS16Collaboration(); },
  screenshotRuns, exportScreenshots,
  log: entry => console.log(JSON.stringify(entry)),
};

/** No effects on import. Test injection is an API seam, never a hosted environment switch. */
export async function runS17HostedDiagnostic(env: Environment = process.env, deps: Dependencies = liveDependencies): Promise<number> {
  let phase = "environment";
  try {
    const commit = deps.head();
    guard(env, commit);
    const diagnosticDeploy = env.DEPLOY_ID;
    phase = "diagnostic-preflight";
    await deps.preflight(env, commit);
    async function confirmMarker() {
      const response = await deps.fetch(`${origin}/__terraqo_s22_candidate.json?diagnostic=${diagnosticDeploy}&phase=${phase}`,
        { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), marker);
    }
    phase = "served-marker-before";
    await confirmMarker();
    const priorRuns = await deps.screenshotRuns?.();
    const keys = ["S22_STAGING_CANDIDATE_SHA", "DEPLOY_ID", "S16_EXCLUSIVE_FIXTURE_WORKSPACE"] as const;
    const prior = keys.map(key => env[key]);
    phase = "real-s16-s17-journey";
    deps.log({ gate: "s17-hosted-diagnostic", phase, diagnosticCommit: commit, diagnosticDeploy,
      servedCommit, servedDeploy, mediaRun: env.PLATFORM_STAGING_S24_BLOB_RUN });
    try {
      // Scope the override strictly to the original verifier; its assertions and cleanup stay intact.
      env.S22_STAGING_CANDIDATE_SHA = servedCommit;
      env.DEPLOY_ID = servedDeploy;
      env.S16_EXCLUSIVE_FIXTURE_WORKSPACE = servedWorkspace;
      await deps.verify();
    } finally {
      keys.forEach((key, index) => { if (prior[index] === undefined) delete env[key]; else env[key] = prior[index]; });
    }
    phase = "served-marker-after";
    await confirmMarker();
    // The unchanged verifier has returned only after its independent database cleanup readback.
    // Optional visual evidence cannot convert a controls PASS into a visual approval.
    if (priorRuns && deps.exportScreenshots) {
      try { await deps.exportScreenshots(priorRuns, deps.log); }
      catch { deps.log({ gate: "s17-hosted-screenshot", exportComplete: false, uxPass: false }); }
    }
    deps.log({ gate: "s17-hosted-diagnostic", result: "PASS", diagnosticCommit: commit, diagnosticDeploy,
      servedCommit, servedDeploy, mediaRun: env.PLATFORM_STAGING_S24_BLOB_RUN,
      journey: "unchanged-verifyS16Collaboration", environmentRestored: true,
      publication: "blocked-by-build-command-exit", exitCode: noPublishExit,
      operatorMediaCleanupRequired: true, phaseComplete: false, uxPass: false });
    // This is a BUILD command: even PASS must stop Netlify before publishing any artifact.
    return noPublishExit;
  } catch {
    // Assertions and provider errors can contain credentials. Never emit their payload or stack.
    deps.log({ gate: "s17-hosted-diagnostic", result: "FAIL", phase, publication: "blocked-by-build-command-exit", exitCode: 1 });
    return 1;
  }
}

// Focused, offline tests live here to keep ownership restricted to the new runner.
async function selfTest() {
  assert.notEqual(process.env.NETLIFY, "true", "Self-tests cannot replace a hosted diagnostic");
  const commit = "a".repeat(40), deploy = "b".repeat(24), run = "11111111-1111-4111-8111-111111111111";
  const database = `postgresql://terraqo_staging_runtime:synthetic@db.${project}.supabase.co/postgres?schema=icc&sslmode=require`;
  const fixture: Environment = { NETLIFY: "true", CONTEXT: "production", BRANCH: "codex/s17-staging-7302dba",
    SITE_ID: site, COMMIT_REF: commit, S22_STAGING_CANDIDATE_SHA: commit, DEPLOY_ID: deploy,
    S17_HOSTED_DIAGNOSTIC_TARGET: target, S17_HOSTED_DIAGNOSTIC_MEDIA_RUN: run,
    PLATFORM_STAGING_S24_BLOB_RUN: run, PLATFORM_STAGING_CLOUD_PHASE: "workspace-administration",
    DATABASE_URL: database, B5_GATE_DATABASE_URL: database, PLATFORM_STAGING_ALLOW_REMOTE: "true",
    PLATFORM_STAGING_DATABASE_ROLE: "terraqo_staging_runtime", PLATFORM_STAGING_SUPABASE_PROJECT_REF: project,
    TERRAQO_S22_STAGING_CONFIRM: `${project}:s22-fixtures`, TERRAQO_WORKSPACE_INVITATIONS_V1: "true",
    TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false", S16_COLLABORATION_GATE: "synthetic-only", S16_ORIGIN: origin,
    S16_EXCLUSIVE_FIXTURE_WORKSPACE: `s13-need-${commit.slice(0, 16)}`, TERRAQO_B5_PILOT_WORKSPACE_IDS: servedWorkspace,
    ...Object.fromEntries(["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL", "AUTH_URL"].map(key => [key, origin])),
    ...Object.fromEntries(["TERRAQO_WORKSPACE_EVALUATORS_V1", "TERRAQO_DISCOVERY_NEEDS_V1", "TERRAQO_SCOPED_SHARING_V1",
      "TERRAQO_CONTEXTUAL_MESSAGING_V1", "TERRAQO_COLLABORATION_V1", "TERRAQO_CLOSURE_V1"].map(key => [key, "true"])),
  };
  let cases = 0;
  const png = Buffer.alloc(9001, 7);
  Buffer.from("89504e470d0a1a0a", "hex").copy(png);
  for (const file of screenshotFiles) {
    const chunks = screenshotChunks(run, file, png);
    assert.ok(chunks.length > 1 && chunks.every(chunk => JSON.stringify(chunk).length <= 4000));
    assert.deepEqual(Buffer.from(chunks.map(chunk => chunk.data).join(""), "base64"), png);
    assert.ok(chunks.every((chunk, index) => chunk.index === index && chunk.total === chunks.length &&
      chunk.sha256 === createHash("sha256").update(png).digest("hex")));
    cases++;
  }
  const maxImage = Buffer.alloc(imageLimit); png.subarray(0, 8).copy(maxImage);
  assert.ok(screenshotChunks(run, screenshotFiles[0], maxImage).every(chunk => JSON.stringify(chunk).length <= 4000)); cases++;
  for (const [file, bytes] of [["../secret.png", png], [screenshotFiles[0], Buffer.alloc(imageLimit + 1)],
    [screenshotFiles[0], Buffer.from("not a PNG")]] as const) {
    assert.throws(() => screenshotChunks(run, file, bytes)); cases++;
  }
  assert.equal(freshScreenshotRun(["old"], ["old", run]), run); cases++;
  for (const after of [[run], ["old", run, "another"], ["old", "../outside"]]) {
    assert.throws(() => freshScreenshotRun(after.length === 1 ? [run] : ["old"], after)); cases++;
  }
  async function test(patch: Environment, failure?: "preflight" | "before" | "after" | "journey" | "http") {
    const env = { ...fixture, ...patch }, before = { ...env }, logs: Record<string, unknown>[] = [];
    let probes = 0, journeys = 0, preflights = 0;
    const deps: Dependencies = {
      head: () => commit,
      preflight: async () => { preflights++; if (failure === "preflight") throw new Error("secret"); },
      fetch: async (_url, options) => {
        probes++; assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store");
        const wrong = (failure === "before" && probes === 1) || (failure === "after" && probes === 2);
        return new Response(JSON.stringify(wrong ? { ...marker, deployId: deploy } : marker), { status: failure === "http" ? 503 : 200 });
      },
      verify: async () => {
        journeys++; assert.equal(env.S22_STAGING_CANDIDATE_SHA, servedCommit);
        assert.equal(env.DEPLOY_ID, servedDeploy); assert.equal(env.S16_EXCLUSIVE_FIXTURE_WORKSPACE, servedWorkspace);
        assert.equal(env.COMMIT_REF, commit); assert.equal(env.PLATFORM_STAGING_S24_BLOB_RUN, run);
        if (failure === "journey") throw new Error("secret");
      }, log: entry => { logs.push(entry); },
    };
    const status = await runS17HostedDiagnostic(env, deps);
    const valid = Object.keys(patch).length === 0;
    assert.equal(status, valid && !failure ? noPublishExit : 1);
    assert.equal(logs.some(entry => entry.result === "PASS"), valid && !failure);
    assert.equal(journeys, valid && !["preflight", "before", "http"].includes(failure ?? "") ? 1 : 0);
    assert.equal(preflights, valid ? 1 : 0);
    assert.deepEqual(env, before); assert.ok(!JSON.stringify(logs).includes("secret")); cases++;
  }
  await test({});
  for (const failure of ["preflight", "before", "after", "journey", "http"] as const) await test({}, failure);
  for (const patch of [{ SITE_ID: "production" }, { BRANCH: "main" }, { CONTEXT: "deploy-preview" },
    { COMMIT_REF: servedCommit }, { S22_STAGING_CANDIDATE_SHA: servedCommit }, { DEPLOY_ID: servedDeploy },
    { S17_HOSTED_DIAGNOSTIC_TARGET: `${servedCommit}/${deploy}` }, { S17_HOSTED_DIAGNOSTIC_TARGET: "off" },
    { DATABASE_URL: database.replace(project, "wrong") }, { PLATFORM_STAGING_SUPABASE_PROJECT_REF: "wrong" },
    { S16_ORIGIN: "https://terraqoglobal.com" }, { TERRAQO_B5_PILOT_WORKSPACE_IDS: "*" },
    { S16_EXCLUSIVE_FIXTURE_WORKSPACE: servedWorkspace }, { S17_HOSTED_DIAGNOSTIC_MEDIA_RUN: "missing" },
    { S24_STAGING_DIAGNOSTIC_TARGET: target }, { S24_STAGING_RECOVER_INTERRUPTED: "active" },
    { TERRAQO_CLOSURE_V1: "false" }]) await test(patch);
  // Exercise the real OS exit status after a mock PASS. No remote capabilities enter this subprocess.
  const moduleUrl = pathToFileURL(resolve("scripts/run-s17-hosted-diagnostic.ts")).href;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval",
    `import { runS17HostedDiagnostic } from ${JSON.stringify(moduleUrl)};
     process.exitCode = await runS17HostedDiagnostic(${JSON.stringify(fixture)}, {
       head: () => ${JSON.stringify(commit)}, preflight: async () => {}, verify: async () => {},
       fetch: async () => new Response(${JSON.stringify(JSON.stringify(marker))}), log: x => console.log(JSON.stringify(x))
     });`], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  assert.equal(child.status, noPublishExit); assert.ok(child.stdout.includes('"result":"PASS"')); cases++;
  const pluginTest = spawnSync(process.execPath, ["--eval", `
    const assert = require('node:assert/strict');
    const fixture = ${JSON.stringify(fixture)};
    let status = 0, spawned = 0;
    require('node:child_process').spawnSync = () => { spawned++; return { status, stdout: '', stderr: '' }; };
    const plugin = require('./plugins/terraqo-staging-gate/index.cjs');
    function check(patch, expectedCommand, expectedSpawns, expectedFailures, exitStatus = 0) {
      process.env = { ...fixture, ...patch }; status = exitStatus; spawned = 0;
      let failures = 0, cancelled = 0;
      const context = { netlifyConfig: { build: { command: 'npm run build' } }, utils: { build: {
        failBuild: () => { failures++; }, cancelBuild: () => { cancelled++; }
      } } };
      plugin.onPreBuild(context);
      assert.equal(context.netlifyConfig.build.command, expectedCommand);
      assert.equal(spawned, expectedSpawns); assert.equal(failures, expectedFailures); assert.equal(cancelled, 0);
    }
    check({}, 'node --import tsx scripts/run-s17-hosted-diagnostic.ts', 1, 0);
    check({}, 'npm run build', 1, 1, 1);
    check({ S17_HOSTED_DIAGNOSTIC_TARGET: undefined }, 'npm run build', 1, 0);
    check({ S17_HOSTED_DIAGNOSTIC_TARGET: 'off' }, 'npm run build', 1, 0);
    for (const patch of [{ SITE_ID: 'production' }, { CONTEXT: 'deploy-preview' }, { BRANCH: 'main' },
      { S17_HOSTED_DIAGNOSTIC_TARGET: 'wrong' }, { S24_STAGING_DIAGNOSTIC_TARGET: 'active' },
      { S24_STAGING_RECOVER_INTERRUPTED: 'active' }, { PLATFORM_STAGING_CLOUD_PHASE: 'other' }])
      check(patch, 'npm run build', 0, 1);
    console.log('PASS plugin routing: 11 cases');
  `], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  assert.equal(pluginTest.status, 0); assert.ok(pluginTest.stdout.includes("PASS plugin routing: 11 cases")); cases += 11;
  console.log(`PASS S17 diagnostic offline tests: ${cases}; exit 42 after PASS; destination/marker failures closed; overrides restored.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length === 3 && process.argv[2] === "--self-test") {
    selfTest().catch(() => { console.error("S17 diagnostic self-test failed"); process.exitCode = 1; });
  } else if (process.argv.length !== 2) {
    console.error("S17 diagnostic rejected unexpected arguments"); process.exitCode = 1;
  } else {
    void runS17HostedDiagnostic().then(code => { process.exitCode = code; });
  }
}
