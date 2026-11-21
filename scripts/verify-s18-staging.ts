import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { getStore } from "@netlify/blobs";
import { chromium, expect as baseExpect, type Browser, type BrowserContext } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PDFDocument } from "pdf-lib";
import { migrationSourceChecksums } from "./lib/migration-source-checksums";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as origin,
  workspaceAdministrationStagingSite as siteId, workspaceAdministrationStagingProject as project } from "./lib/workspace-administration-test-target";
import { createGenuineProfessionalDocxFixture } from "./test-professional-office-file-validation";

/**
 * Operator only; importing this module has no effects. No dotenv, deploy, DDL,
 * privilege escalation, mail, checkout, blob writes or fixture deletion here.
 *
 * Offline: node --conditions=react-server --import tsx scripts/verify-s18-staging.ts --self-test
 * Hosted read-only: same command with --preflight (or dispatch S18_STAGING_GATE=preflight).
 * Separately authorized acceptance: --run, S18_STAGING_GATE=synthetic-retained,
 * S18_STAGING_RUN_ID=<fresh UUIDv4>, S18_STAGING_RETENTION=<project>:<run>:retain-private-fixtures.
 * Both hosted modes require the existing S22 hosted metadata, exact source/marker,
 * migration51, lifecycle+sharing flags, mail off and test billing. Preflight needs
 * no blob token and tolerates disabled provider credentials already held by the app.
 * Run ONLY in a separately authorized operator child with a sanitized environment:
 * no mail/payment keys, plus S18_BLOB_READ_TOKEN for this site's private readback.
 * Never provision that token in Netlify build/runtime environment configuration.
 *
 * Receipts live under output/s18-hosted/<run> and contain private synthetic IDs/keys,
 * never passwords/tokens. Retain/export that directory even on failure. A run ID is
 * single-use: DB primary keys serialize competing seeds; no resume/upsert/cleanup.
 * A runtime seed-ACL failure requires separate operator preparation/design review;
 * this script never falls back to a migrator or disables retained-history guards.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = "20261120000300_professional_document_lifecycle";
const endpoint = "/api/terraqo/professional-documents";
const options = { maxRedirects: 0, timeout: 45_000 };
const expect = baseExpect.configure({ timeout: 45_000 });
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type Stage = "preflight" | "run";
type Upload = { name: string; mimeType: string; buffer: Buffer };
type Command = { expectedVersion: number; operationKey: string };

export function assertS18HostedEnvironment(env: NodeJS.ProcessEnv, stage: Stage) {
  assert.ok(stage === "preflight" || stage === "run", "Unknown stage cannot authorize fixtures");
  assert.equal(env.S18_STAGING_GATE, stage === "run" ? "synthetic-retained" : "preflight");
  assert.equal(assertWorkspaceAdministrationTestTarget(env, origin), "staging");
  assert.equal(env.NETLIFY, "true");
  assert.equal(env.CONTEXT, "production");
  assert.equal(env.BRANCH, "codex/s22-evaluator-local");
  assert.equal(env.PLATFORM_STAGING_CLOUD_PHASE, "workspace-administration");
  for (const flag of ["TERRAQO_DOCUMENT_LIFECYCLE_V1", "TERRAQO_SCOPED_SHARING_V1", "TERRAQO_WORKSPACE_EVALUATORS_V1"])
    assert.equal(env[flag], "true");
  assert.equal(env.CULQI_MODE, "test");
  for (const [key, value] of Object.entries(env)) {
    if (stage === "run" && /^(?:.*CULQI.*(?:KEY|TOKEN)|RESEND_API_KEY|SMTP_.*)$/i.test(key)) assert.ok(!value, "Provider credentials forbidden in acceptance child");
    if (/^S(?:0[6-9]|1[0-6])_.*GATE$/.test(key)) assert.ok(!value || value === "off", "Exclusive S18 dispatch required");
  }
  assert.ok(!env.S24_STAGING_DIAGNOSTIC_TARGET || env.S24_STAGING_DIAGNOSTIC_TARGET === "off");
  assert.ok(!env.S24_STAGING_RECOVER_INTERRUPTED || env.S24_STAGING_RECOVER_INTERRUPTED === "off");
  assert.match(env.S22_STAGING_CANDIDATE_SHA || "", /^[a-f0-9]{40}$/);
  assert.equal(env.COMMIT_REF, env.S22_STAGING_CANDIDATE_SHA);
  assert.match(env.DEPLOY_ID || "", /^[a-f0-9]{24}$/);
  assert.match(env.S18_STAGING_RUN_ID || "", uuid);
  if (stage === "run") {
    assert.ok(env.S18_BLOB_READ_TOKEN, "Explicit site blob readback credential required in acceptance child only");
    assert.equal(env.S18_STAGING_RETENTION, `${project}:${env.S18_STAGING_RUN_ID}:retain-private-fixtures`);
  }
  return { run: env.S18_STAGING_RUN_ID!, commit: env.COMMIT_REF!, deployId: env.DEPLOY_ID! };
}

async function databasePreflight(db: PrismaClient) {
  const identity = await db.$queryRaw<Array<{ role: string; session: string; database: string; unsafe: boolean; exposed: boolean }>>`
    SELECT current_user AS role, session_user AS session, current_database() AS database,
      (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR
       has_schema_privilege(current_user,'icc','CREATE') OR
       pg_has_role(current_user,'terraqo_staging_migrator','MEMBER')) AS unsafe,
      (has_schema_privilege('anon','icc','USAGE') OR has_schema_privilege('authenticated','icc','USAGE') OR
       has_schema_privilege('service_role','icc','USAGE')) AS exposed
    FROM pg_roles r WHERE r.rolname=current_user`;
  assert.deepEqual(identity, [{ role: "terraqo_staging_runtime", session: "terraqo_staging_runtime", database: "postgres", unsafe: false, exposed: false }]);
  const ledger = await db.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
    SELECT migration_name,checksum,finished_at,rolled_back_at FROM icc._prisma_migrations ORDER BY migration_name`;
  assert.equal(ledger.filter(row => !row.finished_at && !row.rolled_back_at).length, 0);
  const applied = ledger.filter(row => row.finished_at && !row.rolled_back_at);
  assert.equal(applied.length, 51, "Requires migration51; never applies it");
  assert.equal(new Set(applied.map(row => row.migration_name)).size, 51);
  assert.equal(applied.at(-1)?.migration_name, migration);
  for (const row of applied) {
    assert.match(row.migration_name, /^[a-z0-9_]+$/);
    assert.ok(migrationSourceChecksums(await readFile(path.join(root, "prisma/migrations", row.migration_name, "migration.sql"))).has(row.checksum));
  }
  const guards = await db.$queryRaw<Array<{ ok: boolean }>>`
    SELECT (
      (SELECT count(*) FROM pg_proc WHERE pronamespace='icc'::regnamespace AND
       proname IN ('guard_document_replacement_attempt','guard_professional_document_lifecycle') AND
       pronargs=0 AND NOT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, icc'])=2 AND
      (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND
       ((tgname='DocumentReplacementAttempt_guard' AND tgrelid='icc."TerraqoDocumentReplacementAttempt"'::regclass) OR
        (tgname='ProfessionalDocument_lifecycle_guard' AND tgrelid='icc."TerraqoProfessionalDocument"'::regclass)))=2 AND
      (SELECT count(*) FROM information_schema.columns WHERE table_schema='icc' AND table_name='TerraqoProfessionalDocument'
       AND column_name IN ('withdrawnAt','withdrawnByUserId','withdrawOperationKey','replacesDocumentId','replacementOperationKey','replacementFingerprint','lifecycleVersion'))=7
    ) AS ok`;
  assert.deepEqual(guards, [{ ok: true }]);
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
    const [row] = await db.$queryRaw<Array<{ allowed: boolean; exposed: boolean }>>`
      SELECT has_table_privilege(current_user,'icc."TerraqoDocumentReplacementAttempt"',${privilege}) AS allowed,
        (has_table_privilege('anon','icc."TerraqoDocumentReplacementAttempt"',${privilege}) OR
         has_table_privilege('authenticated','icc."TerraqoDocumentReplacementAttempt"',${privilege}) OR
         has_table_privilege('service_role','icc."TerraqoDocumentReplacementAttempt"',${privilege})) AS exposed`;
    assert.deepEqual(row, { allowed: ["SELECT", "INSERT", "UPDATE"].includes(privilege), exposed: false });
  }
  for (const name of ["icc.guard_document_replacement_attempt()", "icc.guard_professional_document_lifecycle()"]) {
    const [row] = await db.$queryRaw<Array<{ allowed: boolean; exposed: boolean }>>`
      SELECT has_function_privilege(current_user,${name},'EXECUTE') AS allowed,
        (has_function_privilege('anon',${name},'EXECUTE') OR has_function_privilege('authenticated',${name},'EXECUTE') OR
         has_function_privilege('service_role',${name},'EXECUTE')) AS exposed`;
    assert.deepEqual(row, { allowed: true, exposed: false });
  }
  // Check every direct seed permission BEFORE any fixture is created. No role fallback.
  for (const table of ["User", "TerraqoProfessionalProfile", "TerraqoWorkspace", "TerraqoWorkspaceMember",
    "TerraqoWorklogEntry", "TerraqoWorklogRevision", "TerraqoAccessGrant"]) {
    const [row] = await db.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT (has_table_privilege(current_user,${'icc."' + table + '"'},'SELECT') AND
        has_table_privilege(current_user,${'icc."' + table + '"'},'INSERT')) AS allowed`;
    assert.equal(row.allowed, true, `SEED_ACL_BLOCKED: ${table}; separate preparation required, no escalation`);
  }
  const [update] = await db.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT has_table_privilege(current_user,'icc."TerraqoWorklogEntry"','UPDATE') AS allowed`;
  assert.equal(update.allowed, true, "SEED_ACL_BLOCKED: worklog pointer");
}

function idsFor(run: string) {
  const id = (label: string) => "c" + sha(`s18-hosted:${run}:${label}`).slice(0, 24);
  return { owner: id("owner"), recipient: id("recipient"), outsider: id("outsider"), profile: id("profile"),
    workspace: id("workspace"), worklog: id("worklog"), revision: id("revision"), expiredGrant: id("expired-grant") };
}
type Ids = ReturnType<typeof idsFor>;

async function seed(db: PrismaClient, ids: Ids, run: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction(async tx => {
    // INSERT-only, deterministic keys: a previous/parallel run must fail atomically.
    for (const id of [ids.owner, ids.recipient, ids.outsider]) await tx.user.create({ data: {
      id, email: `${id}@example.invalid`, name: "S18 hosted synthetic " + run, role: "CUSTOMER", emailVerified: new Date(), passwordHash,
      terraqoProfessionalProfile: { create: { ...(id === ids.owner ? { id: ids.profile } : {}), visibility: "PRIVATE", liveCvEnabled: false } },
    } });
    await tx.terraqoWorkspace.create({ data: { id: ids.workspace, slug: "s18-hosted-" + run, name: "S18 synthetic " + run,
      type: "CLIENT_COMPANY", ownerUserId: ids.owner, members: { create: [
        { userId: ids.owner, role: "OWNER", active: true }, { userId: ids.outsider, role: "ADMIN", active: true },
      ] } } });
    await tx.terraqoWorklogEntry.create({ data: { id: ids.worklog, authorId: ids.owner, professionalProfileId: ids.profile,
      title: "Private S18 " + run, summary: "Authorized S18 " + run, lifecycle: "PUBLISHED", visibility: "PRIVATE" } });
    await tx.terraqoWorklogRevision.create({ data: { id: ids.revision, worklogId: ids.worklog, revisionNo: 1,
      title: "Private S18 " + run, summary: "Authorized S18 " + run, outcome: "Excluded S18 " + run,
      createdById: ids.owner, contentHash: sha(run) } });
    await tx.terraqoWorklogEntry.update({ where: { id: ids.worklog }, data: { currentRevisionId: ids.revision } });
  }, { isolationLevel: "Serializable", timeout: 30_000 });
}

async function session(browser: Browser, id?: string, password?: string, ui = false) {
  const ctx = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  ctx.setDefaultTimeout(45_000);
  ctx.setDefaultNavigationTimeout(60_000);
  const blockedMutations: string[] = [];
  // Defense in depth: external resources and any billing mutation are blocked.
  await ctx.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || url.searchParams.has("password") ||
      (!['GET', 'HEAD'].includes(request.method()) && /billing|checkout|payment|culqi/i.test(url.pathname))) {
      if (!['GET', 'HEAD'].includes(request.method()) || url.searchParams.has("password")) blockedMutations.push("forbidden-request");
      return route.abort();
    }
    return route.continue();
  });
  try {
    const page = await ctx.newPage();
    if (id && ui) {
      assert.equal((await page.goto("/cuenta?callbackUrl=%2Fportal%2Fdocumentos", { waitUntil: "domcontentloaded" }))?.status(), 200);
      const form = page.getByRole("region", { name: "Iniciar sesión", exact: true }).locator("form");
      // Fail closed on the old native GET login fallback before entering credentials.
      await expect(form).toHaveAttribute("method", "post");
      await expect(async () => {
        await form.getByRole("button", { name: "Mostrar contraseña", exact: true }).click();
        await expect(form.locator('input[name="password"]')).toHaveAttribute("type", "text", { timeout: 1000 });
      }).toPass({ timeout: 45_000 });
      await form.getByRole("button", { name: "Ocultar contraseña", exact: true }).click();
      await form.locator('input[name="email"]').fill(`${id}@example.invalid`);
      await form.locator('input[name="password"]').fill(password!);
      const [reply] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).origin === origin && new URL(r.url()).pathname === "/api/auth/callback/credentials" && r.request().method() === "POST"),
        form.getByRole("button", { name: "Iniciar sesión", exact: true }).click(),
      ]);
      assert.equal(reply.status(), 200);
      await page.waitForURL(origin + "/portal/documentos");
    } else if (id) {
      const csrf = await ctx.request.get("/api/auth/csrf", options);
      assert.equal(csrf.status(), 200);
      const reply = await ctx.request.post("/api/auth/callback/credentials", { ...options,
        headers: { Origin: origin, "X-Auth-Return-Redirect": "1" }, form: { csrfToken: (await csrf.json()).csrfToken,
          email: `${id}@example.invalid`, password: password!, callbackUrl: origin + "/portal/documentos" } });
      assert.equal(reply.status(), 200);
    }
    const reply = await ctx.request.get("/api/auth/session", options);
    assert.equal(reply.status(), 200);
    const user = (await reply.json())?.user;
    if (id) { assert.equal(user?.id, id); assert.equal(user.email, `${id}@example.invalid`); }
    else assert.ok(!user);
    return { ctx, page, blockedMutations };
  } catch (error) { await ctx.close(); throw error; }
}

async function inventory(db: PrismaClient, ids: Ids) {
  const actors = [ids.owner, ids.recipient, ids.outsider];
  return {
    documents: await db.terraqoProfessionalDocument.findMany({ where: { professionalProfileId: ids.profile }, orderBy: { id: "asc" } }),
    attempts: await db.terraqoDocumentReplacementAttempt.findMany({ where: { professionalProfileId: ids.profile }, orderBy: { id: "asc" } }),
    profile: await db.terraqoProfessionalProfile.findUnique({ where: { id: ids.profile }, select: { id: true, cvUrl: true, visibility: true, liveCvEnabled: true } }),
    usage: await db.terraqoUsageBucket.findMany({ where: { ownerKey: { in: actors.map(id => `user:${id}`) } }, orderBy: { id: "asc" } }),
    collections: await db.terraqoShareCollection.findMany({ where: { createdById: { in: actors } }, orderBy: { id: "asc" } }),
    grants: await db.terraqoAccessGrant.findMany({ where: { issuedById: { in: actors } }, orderBy: { id: "asc" } }),
  };
}

export async function verifyS18Staging(stage: Stage = "run") {
  const env = process.env;
  const candidate = assertS18HostedEnvironment(env, stage);
  for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) assert.ok(!existsSync(path.join(root, file)));
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, windowsHide: true, encoding: "utf8", timeout: 15_000 }).trim();
  assert.equal(git(["rev-parse", "HEAD"]), candidate.commit);
  // The existing prepare hook generates this one untracked public marker.
  // No uncommitted source is allowed; the generated marker must match exactly.
  const status = git(["status", "--porcelain", "--untracked-files=all"]);
  assert.deepEqual(status.split(/\r?\n/).filter(line => line && line !== "?? public/__terraqo_s22_candidate.json"), [],
    "Hosted candidate must be a clean committed source");
  if (existsSync(path.join(root, "public/__terraqo_s22_candidate.json")))
    assert.deepEqual(JSON.parse(await readFile(path.join(root, "public/__terraqo_s22_candidate.json"), "utf8")),
      { kind: "workspace-administration", siteId, commit: candidate.commit, deployId: candidate.deployId });
  async function served() {
    const reply = await fetch(`${origin}/__terraqo_s22_candidate.json?deploy=${candidate.deployId}`, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { kind: "workspace-administration", siteId, commit: candidate.commit, deployId: candidate.deployId });
  }
  await served();
  const db = new PrismaClient();
  let browser: Browser | undefined;
  const ids = idsFor(candidate.run);
  let directory: string | undefined;
  const receipt: Record<string, unknown> = { kind: "s18-hosted", ...candidate, project, siteId, ids, passed: false,
    phase: "database-preflight", retention: "private-synthetic-retained; no cascade/blob cleanup authorized", migration,
    limitations: ["No native lifecycle acceptance", "No production/payment/email acceptance", "No general account-erasure authorization"] };
  const persist = async () => {
    if (directory) await writeFile(path.join(directory, "receipt.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  };
  try {
    await databasePreflight(db);
    await served();
    if (stage === "preflight") {
      console.log(JSON.stringify({ ...candidate, gate: "s18-preflight", preflightPassed: true, acceptancePassed: false, fixturesWritten: false }));
      return;
    }
    const requestedDirectory = path.join(root, "output/s18-hosted", candidate.run);
    await mkdir(path.dirname(requestedDirectory), { recursive: true });
    await mkdir(requestedDirectory, { mode: 0o700 }); // Exclusive local receipt, never overwrite a prior run.
    directory = requestedDirectory; // Only own the directory after exclusive creation succeeds.
    receipt.phase = "seed-intent";
    await writeFile(path.join(directory, "intent.json"), JSON.stringify(receipt, null, 2), { flag: "wx", mode: 0o600 });
    await persist(); // Immutable intent keeps IDs after interruption of a later receipt write.
    const password = randomBytes(32).toString("base64url");
    await seed(db, ids, candidate.run, password);
    receipt.phase = "actual-login";
    await persist();
    browser = await chromium.launch({ headless: true });
    const owner = await session(browser, ids.owner, password, true);
    const reader = await session(browser, ids.recipient, password);
    const outsider = await session(browser, ids.outsider, password);
    const anonymous = await session(browser);
    const { ctx, page } = owner;
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.name));
    async function capture(name: string) {
      for (const width of [1440, 375, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(async () => { await document.fonts.ready; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(directory!, `${name}-${width}.png`), fullPage: true });
      }
      assert.deepEqual(pageErrors, []);
    }
    const post = (context: BrowserContext, target: string, command: Command, requestOrigin = origin) =>
      context.request.post(target, { ...options, headers: { Origin: requestOrigin }, data: command });
    const upload = (context: BrowserContext, target: string, command: Command, file: Upload) =>
      context.request.post(target, { ...options, headers: { Origin: origin }, multipart: {
        expectedVersion: String(command.expectedVersion), operationKey: command.operationKey, file,
      } });
    const panel = page.locator("#documentos-datos");
    const uiPost = async (target: string, button: string) => {
      const [reply] = await Promise.all([
        page.waitForResponse(r => r.url() === origin + target && r.request().method() === "POST", { timeout: 90_000 }),
        panel.getByRole("button", { name: button, exact: true }).click(),
      ]);
      assert.equal(reply.status(), 200);
      return reply;
    };
    // Separate read-only store capability; never expose set/delete/list to the journey.
    const store = getStore({ name: "terraqo-professional-documents", siteID: siteId, token: env.S18_BLOB_READ_TOKEN!, consistency: "strong",
      fetch: (url, init) => {
        assert.ok(["GET", "HEAD"].includes((init?.method || "GET").toUpperCase()), "Blob mutation forbidden");
        return fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) });
      } });
    const bytes = new Map<string, Buffer>();
    async function retainedBlobs() {
      const result = [];
      const documents = await db.terraqoProfessionalDocument.findMany({ where: { professionalProfileId: ids.profile }, orderBy: { id: "asc" } });
      for (const doc of documents) {
        assert.ok(doc.storageKey.startsWith(`professional-documents/${ids.profile}/`));
        assert.ok(!doc.storageKey.split("/").some(part => part === ".." || part === "."));
        const [data, metadata] = await Promise.all([
          store.get(doc.storageKey, { type: "arrayBuffer", consistency: "strong" }), store.getMetadata(doc.storageKey, { consistency: "strong" }),
        ]);
        assert.ok(data && metadata);
        assert.equal(data.byteLength, doc.size);
        assert.deepEqual(Buffer.from(data), bytes.get(doc.id), "Retained provider bytes, including withdrawn files");
        assert.ok(metadata.etag);
        result.push({ documentId: doc.id, storageKey: doc.storageKey, size: doc.size, sha256: sha(Buffer.from(data)),
          etag: metadata.etag, metadata: metadata.metadata, withdrawnAt: doc.withdrawnAt, replacesDocumentId: doc.replacesDocumentId });
      }
      return result;
    }
    const snapshot = async () => ({ sql: await inventory(db, ids), blobs: await retainedBlobs() });
    const download = async (id: string) => {
      const reply = await ctx.request.get(`${endpoint}/${id}`, options);
      assert.equal(reply.status(), 200);
      assert.match(reply.headers()["cache-control"], /no-store/);
      assert.deepEqual(await reply.body(), bytes.get(id));
    };
    receipt.phase = "documents";
    await served(); await persist();
    const pdf = await PDFDocument.create(); pdf.addPage().drawText("S18 hosted synthetic CV");
    const first: Upload = { name: "S18-initial.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) };
    await panel.locator('input[name="cvFile"]').setInputFiles(first);
    await uiPost(endpoint, "Subir CV");
    let current = await db.terraqoProfessionalDocument.findFirstOrThrow({ where: { professionalProfileId: ids.profile } });
    bytes.set(current.id, first.buffer);
    const initial = current;
    await download(initial.id);
    const untouched = await snapshot();
    assert.equal((await ctx.request.post(endpoint, { ...options, headers: { Origin: origin },
      multipart: { purpose: "cv", cvFile: first } })).status(), 409);
    assert.equal((await anonymous.ctx.request.get(`${endpoint}/${initial.id}`, options)).status(), 401);
    assert.equal((await outsider.ctx.request.get(`${endpoint}/${initial.id}`, options)).status(), 403);
    const denied = { expectedVersion: 1, operationKey: randomUUID() };
    assert.equal((await post(anonymous.ctx, `${endpoint}/${initial.id}/withdraw`, denied)).status(), 401);
    assert.equal((await post(outsider.ctx, `${endpoint}/${initial.id}/withdraw`, denied)).status(), 404);
    assert.equal((await upload(outsider.ctx, `${endpoint}/${initial.id}/replacement`, denied, first)).status(), 404);
    assert.equal((await post(ctx, `${endpoint}/${initial.id}/withdraw`, denied, "https://foreign.invalid")).status(), 403);
    assert.deepEqual(await snapshot(), untouched);
    let mutations = 0;
    page.on("request", request => { if (request.method() === "POST" && request.url().includes(endpoint)) mutations++; });
    await panel.getByRole("button", { name: "Nueva versión", exact: true }).click();
    await panel.getByRole("button", { name: "Cancelar", exact: true }).click();
    await panel.getByRole("button", { name: "Retirar documento", exact: true }).click();
    await panel.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(mutations, 0);
    await capture("initial");
    const pdf2 = await PDFDocument.create(); pdf2.addPage().drawText("S18 hosted synthetic revision two");
    const docx = createGenuineProfessionalDocxFixture("S18-version.docx");
    const replacements: Upload[] = [
      { name: "S18-version.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf2.save()) },
      { name: docx.name, mimeType: docx.type, buffer: Buffer.from(await docx.arrayBuffer()) },
    ];
    let last: { target: string; command: Command; file: Upload } | undefined;
    for (const file of replacements) {
      const predecessor = current, target = `${endpoint}/${current.id}/replacement`;
      await panel.getByRole("button", { name: "Nueva versión", exact: true }).click();
      await expect(panel.locator('input[name="file"]')).toHaveAttribute("accept", ".pdf,.docx");
      await panel.locator('input[name="file"]').setInputFiles(file);
      const reply = await uiPost(target, "Guardar nueva versión");
      const request = reply.request(), body = request.postDataBuffer(); assert.ok(body);
      const form = await new Request(origin + target, { method: "POST", headers: { "Content-Type": request.headers()["content-type"] },
        body: new Uint8Array(body) }).formData();
      const command = { expectedVersion: Number(form.get("expectedVersion")), operationKey: String(form.get("operationKey")) };
      assert.equal(command.expectedVersion, predecessor.lifecycleVersion); assert.match(command.operationKey, uuid);
      const data = (await reply.json()).data;
      assert.equal(data.replayed, false);
      current = await db.terraqoProfessionalDocument.findUniqueOrThrow({ where: { id: data.id } });
      assert.equal(current.replacesDocumentId, predecessor.id);
      assert.deepEqual(await db.terraqoProfessionalDocument.findUnique({ where: { id: predecessor.id } }), predecessor);
      bytes.set(current.id, file.buffer);
      await expect(panel.getByText(file.name, { exact: true })).toBeVisible();
      await download(predecessor.id); await download(current.id);
      const committed = await snapshot();
      assert.equal(committed.sql.profile?.cvUrl, `${endpoint}/${current.id}`);
      for (const replay of await Promise.all([upload(ctx, target, command, file), upload(ctx, target, command, file)])) {
        assert.equal(replay.status(), 200); assert.deepEqual((await replay.json()).data, { id: current.id, replayed: true });
      }
      assert.equal((await upload(ctx, target, { ...command, operationKey: randomUUID() }, file)).status(), 409);
      assert.deepEqual(await snapshot(), committed, "Retries/branch rejection cannot allocate, recharge or rewrite blobs");
      last = { target, command, file };
    }
    await expect(panel.getByRole("button", { name: "Previsualizar", exact: true })).toHaveCount(0);
    await capture("replaced");
    const withdrawalTarget = `${endpoint}/${current.id}/withdraw`;
    await panel.getByRole("button", { name: "Retirar documento", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const withdrawal = await uiPost(withdrawalTarget, "Confirmar retiro");
    const command = withdrawal.request().postDataJSON() as Command;
    const withdrawalData = (await withdrawal.json()).data;
    assert.equal(withdrawalData.replayed, false);
    await expect(panel.getByRole("button", { name: "Subir CV", exact: true })).toBeVisible();
    const withdrawn = await snapshot();
    const retired = withdrawn.sql.documents.find(doc => doc.id === current.id)!;
    assert.ok(retired.withdrawnAt); assert.equal(retired.withdrawnByUserId, ids.owner);
    assert.equal(retired.withdrawOperationKey, command.operationKey);
    assert.equal(retired.lifecycleVersion, current.lifecycleVersion + 1);
    for (const replay of await Promise.all([post(ctx, withdrawalTarget, command), post(ctx, withdrawalTarget, command)])) {
      assert.equal(replay.status(), 200); assert.deepEqual((await replay.json()).data, { ...withdrawalData, replayed: true });
    }
    assert.equal((await post(ctx, withdrawalTarget, { ...command, operationKey: randomUUID() })).status(), 409);
    for (const suffix of ["", "?inline=1"]) assert.equal((await ctx.request.get(`${endpoint}/${current.id}${suffix}`, options)).status(), 404);
    assert.ok(last);
    const replay = await upload(ctx, last.target, last.command, last.file);
    assert.equal(replay.status(), 200); assert.deepEqual((await replay.json()).data, { id: current.id, replayed: true });
    assert.deepEqual(await snapshot(), withdrawn, "No resurrection/refund/history rewrite");
    assert.equal(withdrawn.sql.documents.length, 3);
    assert.equal(withdrawn.sql.attempts.length, 2);
    assert.ok(withdrawn.sql.attempts.every(attempt => attempt.state === "COMMITTED"));
    assert.equal(withdrawn.sql.profile?.cvUrl, null);
    assert.equal(withdrawn.sql.usage.find(bucket => bucket.ownerKey === `user:${ids.owner}` && bucket.period === "retained" && bucket.metric === "storage-mb")?.used, 3);
    for (const doc of withdrawn.sql.documents) { assert.equal(doc.type, "CV"); assert.equal(doc.workspaceId, null); assert.equal(doc.reviewStatus, "SUBMITTED"); assert.equal(doc.reviewNote, null); }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(panel.getByRole("button", { name: "Subir CV", exact: true })).toBeVisible();
    await panel.getByText("Versiones anteriores del CV", { exact: true }).click();
    await expect(panel.getByRole("link", { name: "Descargar versión anterior", exact: true })).toHaveCount(2);
    await expect(panel.getByText("Retirado · Historial conservado", { exact: true })).toBeVisible();
    await expect(panel.locator(`a[href="${endpoint}/${current.id}"]`)).toHaveCount(0);
    await download(initial.id); await capture("withdrawn");
    receipt.documentsPassed = true; receipt.retainedBlobs = withdrawn.blobs;
    receipt.phase = "access"; await persist(); await served();
    const title = "S18 selection " + candidate.run;
    const created = await ctx.request.post("/api/v1/share-collections", { ...options,
      headers: { Origin: origin, "Idempotency-Key": randomUUID() },
      data: { title, items: [{ revisionId: ids.revision, allowedFields: ["summary"], includeMedia: false }] },
    });
    assert.equal(created.status(), 201);
    const collection = (await created.json()).data as { id: string; version: number };
    receipt.collectionId = collection.id; await persist();
    const target = `/api/v1/shared-selections/${collection.id}`;
    assert.equal((await reader.ctx.request.get(target, options)).status(), 404);
    const grantReply = await ctx.request.post(`/api/v1/share-collections/${collection.id}/grants`, { ...options,
      headers: { Origin: origin, "Idempotency-Key": randomUUID() }, data: { expectedVersion: collection.version,
        subjectUserId: ids.recipient, scopes: ["VIEW_COLLECTION"], expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    assert.equal(grantReply.status(), 201);
    const grants = await db.terraqoAccessGrant.findMany({ where: { collectionId: collection.id } });
    assert.equal(grants.length, 1);
    const authorized = await reader.ctx.request.get(target, options);
    assert.equal(authorized.status(), 200); assert.match(authorized.headers()["cache-control"], /no-store/);
    const visible = (await authorized.json()).data;
    assert.deepEqual(visible.items, [{ worklogId: ids.worklog, summary: "Authorized S18 " + candidate.run, media: [] }]);
    assert.deepEqual(visible.capabilities, { downloadMedia: false });
    assert.equal((await outsider.ctx.request.get(target, options)).status(), 404);
    assert.equal((await anonymous.ctx.request.get(target, options)).status(), 401);
    const [clock] = await db.$queryRaw<Array<{ expired: Date }>>`SELECT now()-interval '1 minute' AS expired`;
    await db.terraqoAccessGrant.create({ data: { id: ids.expiredGrant, collectionId: collection.id, subjectUserId: ids.outsider,
      issuedById: ids.owner, scopes: ["VIEW_COLLECTION"], expiresAt: clock.expired,
      operationKey: randomUUID(), operationFingerprint: sha("expired-" + candidate.run) } });
    assert.equal((await outsider.ctx.request.get(target, options)).status(), 404);
    await outsider.page.goto("/portal/accesos");
    await expect(outsider.page.getByRole("article", { name: title, exact: true })).toHaveCount(0);
    await page.goto("/portal/accesos");
    const item = page.getByRole("article", { name: title, exact: true });
    await expect(item.getByText("Vigente", { exact: true })).toBeVisible();
    await expect(item.getByText("Vencido", { exact: true })).toBeVisible();
    let deletions = 0;
    page.on("request", request => { if (request.method() === "DELETE") deletions++; });
    await item.getByRole("button", { name: "Revocar acceso", exact: true }).click();
    await expect(item.getByText(/no recupera las copias/)).toBeVisible();
    await item.getByRole("button", { name: "Conservar acceso" }).click();
    assert.equal(deletions, 0); await capture("access");
    await item.getByRole("button", { name: "Revocar acceso", exact: true }).click();
    await item.getByRole("button", { name: "Confirmar revocación" }).click();
    await expect(page.getByRole("region", { name: "Accesos que has compartido", exact: true }).getByRole("status")).toContainText("Acceso revocado");
    assert.equal(deletions, 1);
    assert.equal((await reader.ctx.request.get(target, options)).status(), 404);
    const revoked = await db.terraqoAccessGrant.findUniqueOrThrow({ where: { id: grants[0].id } });
    assert.equal(revoked.lifecycle, "REVOKED"); assert.ok(revoked.revokedAt);
    await page.reload(); await expect(item.getByText("Revocado", { exact: true })).toBeVisible();
    await expect(item.getByRole("button", { name: "Revocar acceso", exact: true })).toHaveCount(0);
    receipt.accessPassed = true; receipt.phase = "read-only-plan"; await persist(); await served();
    const billingSnapshot = async () => {
      const where = { userId: { in: [ids.owner, ids.recipient, ids.outsider] } };
      return { accounts: await db.terraqoBillingAccount.findMany({ where, orderBy: { id: "asc" } }),
        payments: await db.terraqoBillingPayment.findMany({ where: { account: where }, orderBy: { id: "asc" } }),
        attempts: await db.terraqoBillingAttempt.findMany({ where: { account: where }, orderBy: { id: "asc" } }),
        worklog: await db.terraqoWorklogEntry.findUniqueOrThrow({ where: { id: ids.worklog } }) };
    };
    const billingBefore = await billingSnapshot();
    for (const [context, workspaces] of [[ctx, [{ id: ids.workspace, name: "S18 synthetic " + candidate.run }]], [outsider.ctx, []]] as const) {
      const reply = await context.request.get("/api/terraqo/billing", options);
      assert.equal(reply.status(), 200); assert.match(reply.headers()["cache-control"], /private, no-store/);
      const data = await reply.json();
      assert.equal(data.mode, "test"); assert.equal(data.publicKey, null); assert.deepEqual(data.workspaces, workspaces);
    }
    assert.equal((await anonymous.ctx.request.get("/api/terraqo/billing", options)).status(), 401);
    const nav = page.getByRole("navigation", { name: "Privacidad y cuenta" });
    await expect(nav.getByRole("link", { name: "Documentos privados" })).toHaveAttribute("href", "/portal/documentos");
    await nav.getByRole("link", { name: "Mi plan y uso" }).click();
    await expect(page.getByRole("heading", { name: "Tu membresía, bajo tu control." })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Privacidad y cuenta" }).getByRole("link", { name: "Mi plan y uso" })).toHaveAttribute("aria-current", "page");
    await capture("plan");
    for (const session of [owner, reader, outsider, anonymous]) assert.deepEqual(session.blockedMutations, [], "No attempted checkout/external mutation");
    assert.deepEqual(await billingSnapshot(), billingBefore);
    assert.equal(await db.terraqoPublicProjection.count({ where: { collection: { createdById: ids.owner } } }), 0);
    assert.deepEqual((await inventory(db, ids)).profile, withdrawn.sql.profile);
    assert.deepEqual(await retainedBlobs(), withdrawn.blobs);
    receipt.planPassed = true;
    await served(); await databasePreflight(db);
    receipt.phase = "complete"; receipt.passed = true;
  } catch (error) {
    receipt.passed = false;
    receipt.error = { code: typeof (error as { code?: unknown }).code === "string" && /^[A-Z0-9_]{1,32}$/.test((error as { code: string }).code)
      ? (error as { code: string }).code : "GATE_REJECTED" };
    console.error(JSON.stringify({ gate: "s18-hosted", passed: false, phase: receipt.phase, ...receipt.error as object,
      seedBlocker: error instanceof Error && /^SEED_ACL_BLOCKED: [A-Za-z ]+/.test(error.message)
        ? error.message.split(";")[0] : undefined }));
    throw error;
  } finally {
    // Retained records are deliberately NEVER cascaded/deleted, including failed runs.
    try {
      if (directory) {
        try { receipt.inventory = await inventory(db, ids); }
        catch { receipt.inventoryReadFailed = true; receipt.passed = false; }
        await persist();
      }
    } finally { await browser?.close(); await db.$disconnect(); }
  }
  assert.equal(receipt.passed, true);
  console.log(JSON.stringify({ gate: "s18-hosted", passed: true, ...candidate, receipt: path.relative(root, path.join(directory!, "receipt.json")),
    retention: "Private synthetic rows, lineage, withdrawn blobs and metadata retained; no cleanup performed" }));
}

/** Pure negative tests: no Prisma construction, network, filesystem writes or credentials. */
export function selfTestS18Guard() {
  const run = "11111111-1111-4111-8111-111111111111";
  const database = `postgresql://terraqo_staging_runtime:synthetic@db.${project}.supabase.co:5432/postgres?schema=icc&sslmode=verify-full`;
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production", S18_STAGING_GATE: "synthetic-retained", S18_STAGING_RUN_ID: run,
    S18_STAGING_RETENTION: `${project}:${run}:retain-private-fixtures`, S18_BLOB_READ_TOKEN: "offline-only",
    DATABASE_URL: database, DIRECT_URL: database, B5_GATE_DATABASE_URL: database, SITE_ID: siteId,
    TERRAQO_S22_STAGING_CONFIRM: `${project}:s22-fixtures`, PLATFORM_STAGING_SUPABASE_PROJECT_REF: project,
    PLATFORM_STAGING_DATABASE_ROLE: "terraqo_staging_runtime", PLATFORM_STAGING_ALLOW_REMOTE: "true",
    NETLIFY: "true", CONTEXT: "production", BRANCH: "codex/s22-evaluator-local", PLATFORM_STAGING_CLOUD_PHASE: "workspace-administration",
    TERRAQO_WORKSPACE_INVITATIONS_V1: "true", TERRAQO_WORKSPACE_EVALUATORS_V1: "true", TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false",
    TERRAQO_DOCUMENT_LIFECYCLE_V1: "true", TERRAQO_SCOPED_SHARING_V1: "true", CULQI_MODE: "test",
    S22_STAGING_CANDIDATE_SHA: "a".repeat(40), COMMIT_REF: "a".repeat(40), DEPLOY_ID: "b".repeat(24) };
  for (const key of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL", "AUTH_URL"]) env[key] = origin;
  assert.equal(assertS18HostedEnvironment(env, "run").run, run);
  let rejected = 0;
  for (const [key, value] of Object.entries({ S18_STAGING_GATE: "synthetic-only", S18_STAGING_RETENTION: "", S18_STAGING_RUN_ID: "../escape",
    S18_BLOB_READ_TOKEN: "", SITE_ID: "other", PLATFORM_STAGING_SUPABASE_PROJECT_REF: "other", PLATFORM_STAGING_ALLOW_REMOTE: "false",
    PLATFORM_STAGING_DATABASE_ROLE: "postgres", NETLIFY: "false", CONTEXT: "deploy-preview", BRANCH: "main", AUTH_URL: "https://terraqoglobal.com",
    TERRAQO_LOCAL_S22_TEST: "synthetic-only", TERRAQO_DOCUMENT_LIFECYCLE_V1: "false", TERRAQO_SCOPED_SHARING_V1: "false",
    TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "true", CULQI_MODE: "live", CULQI_SECRET_KEY: "forbidden", NEXT_PUBLIC_CULQI_PUBLIC_KEY: "forbidden",
    RESEND_API_KEY: "forbidden", COMMIT_REF: "c".repeat(40), DEPLOY_ID: "old", S16_COLLABORATION_GATE: "synthetic-only",
    S24_STAGING_DIAGNOSTIC_TARGET: "other", DATABASE_URL: database + "&host=other" })) {
    assert.throws(() => assertS18HostedEnvironment({ ...env, [key]: value }, "run"), `Must reject ${key}`); rejected++;
  }
  assertS18HostedEnvironment({ ...env, S18_STAGING_GATE: "preflight", S18_STAGING_RETENTION: undefined,
    S18_BLOB_READ_TOKEN: undefined, RESEND_API_KEY: "disabled-existing-app-key" }, "preflight");
  assert.throws(() => assertS18HostedEnvironment({ ...env, S18_STAGING_GATE: "preflight" }, "run"));
  assert.throws(() => assertS18HostedEnvironment({ ...env, S18_STAGING_GATE: "preflight" }, "unexpected" as Stage));
  assert.deepEqual(idsFor(run), idsFor(run));
  assert.notDeepEqual(idsFor(run), idsFor("22222222-2222-4222-8222-222222222222"));
  console.log(`PASS S18 offline guards: ${rejected} unsafe configurations rejected; preflight cannot authorize writes; deterministic isolated IDs`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [command, ...extra] = process.argv.slice(2);
  Promise.resolve().then(async () => {
    assert.equal(extra.length, 0);
    if (command === "--self-test") selfTestS18Guard();
    else { assert.ok(command === "--preflight" || command === "--run"); await verifyS18Staging(command === "--run" ? "run" : "preflight"); }
  }).catch(() => { console.error("S18_FAILED: no acceptance PASS; inspect phase/retained IDs in the private run receipt. Never cascade cleanup."); process.exitCode = 1; });
}
