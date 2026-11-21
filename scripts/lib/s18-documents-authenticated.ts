import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chromium, expect as baseExpect, type Browser, type BrowserContext } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { createGenuineProfessionalDocxFixture } from "../test-professional-office-file-validation";
import { verifyS18AccessLocal } from "./s18-access-authenticated";

const expect = baseExpect.configure({ timeout: 45000 });
const endpoint = "/api/terraqo/professional-documents";
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
type Upload = { name: string; mimeType: string; buffer: Buffer };
type Command = { expectedVersion: number; operationKey: string };
const options = { maxRedirects: 0, timeout: 60000 };

async function verifyNoScriptSignIn(browser: Browser, origin: string) {
  const context = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/cuenta", { waitUntil: "domcontentloaded" });
    const form = page.getByRole("region", { name: "Iniciar sesión", exact: true }).locator("form");
    await expect(form).toHaveAttribute("method", "post");
    // Deliberately invalid synthetic credentials; no account or login bypass is created.
    await form.locator('input[name="email"]').fill("no-script@example.invalid");
    const password = randomBytes(24).toString("hex");
    await form.locator('input[name="password"]').fill(password);
    const [request] = await Promise.all([
      page.waitForRequest(request => request.isNavigationRequest() && new URL(request.url()).pathname === "/cuenta"),
      form.getByRole("button", { name: "Iniciar sesión", exact: true }).click(),
    ]);
    assert.equal(request.method(), "POST");
    assert.equal(new URL(request.url()).searchParams.has("password"), false);
    assert.equal(request.url().includes(password), false);
    await request.response();
    const session = await context.request.get("/api/auth/session", options);
    assert.equal(session.status(), 200);
    assert.equal(Boolean((await session.json())?.user), false);
    console.log("PASS login without JavaScript: POST fallback, no credential in URL, no session bypass");
  } finally { await context.close(); }
}

async function login(browser: Browser, origin: string, id: string, password: string, width: number, ui = false) {
  const ctx = await browser.newContext({ baseURL: origin, viewport: { width, height: 960 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: "block" });
  ctx.setDefaultTimeout(45000);
  ctx.setDefaultNavigationTimeout(90000);
  // No interception/fulfillment of app responses: all same-origin traffic reaches actual Next routes.
  await ctx.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await ctx.newPage();
  const email = `${id}@s18.invalid`;
  if (ui) {
    assert.equal((await page.goto("/cuenta?callbackUrl=%2Fportal%2Fdocumentos", { waitUntil: "domcontentloaded" }))?.status(), 200);
    // The 3D registration face still has layout bounds; visibility alone matches both forms.
    const form = page.getByRole("region", { name: "Iniciar sesión", exact: true }).locator("form");
    // SSR fields are actionable before onSubmit hydrates. Prove a real React
    // interaction first; never send credentials through the form's native GET fallback.
    await expect(async () => {
      await form.getByRole("button", { name: "Mostrar contraseña", exact: true }).click();
      await expect(form.locator('input[name="password"]')).toHaveAttribute("type", "text", { timeout: 1000 });
    }).toPass({ timeout: 45000 });
    await form.getByRole("button", { name: "Ocultar contraseña", exact: true }).click();
    await expect(form.locator('input[name="password"]')).toHaveAttribute("type", "password");
    await form.locator('input[name="email"]').fill(email);
    await form.locator('input[name="password"]').fill(password);
    const [callback] = await Promise.all([
      page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.origin === origin && url.pathname === "/api/auth/callback/credentials" && response.request().method() === "POST";
      }, { timeout: 45000 }),
      form.getByRole("button", { name: "Iniciar sesión", exact: true }).click(),
    ]);
    assert.equal(callback.status(), 200);
    await page.waitForURL(origin + "/portal/documentos", { timeout: 90000 });
  } else {
    const csrf = await ctx.request.get("/api/auth/csrf", options);
    assert.equal(csrf.status(), 200);
    const callback = await ctx.request.post("/api/auth/callback/credentials", { ...options,
      headers: { Origin: origin, "X-Auth-Return-Redirect": "1" }, form: { csrfToken: (await csrf.json()).csrfToken, email, password, callbackUrl: origin + "/portal/documentos" } });
    assert.equal(callback.status(), 200);
  }
  const session = await ctx.request.get("/api/auth/session", options);
  assert.equal(session.status(), 200);
  const user = (await session.json()).user;
  assert.equal(user?.id, id, "Real Auth.js credential login must issue the expected identity");
  assert.equal(user.email, email);
  return { ctx, page };
}

async function files(root: string): Promise<Array<{ key: string; sha256: string; modified: number }>> {
  const result: Array<{ key: string; sha256: string; modified: number }> = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === "ENOENT") return []; throw error;
    })) {
      const file = path.join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false);
      if (entry.isDirectory()) await walk(file);
      else result.push({ key: path.relative(root, file), sha256: sha(await readFile(file)), modified: (await stat(file)).mtimeMs });
    }
  }
  await walk(root);
  return result.sort((a, b) => a.key.localeCompare(b.key));
}

async function documentJourney(input: { db: PrismaClient; browser: Browser; origin: string; artifactDir: string; local: string; width: number }) {
  const { db, browser, origin, artifactDir, local, width } = input;
  const id = `s18-doc-${width}-${randomUUID()}`, other = `s18-other-${randomUUID()}`;
  const password = randomBytes(24).toString("base64url"), passwordHash = await bcrypt.hash(password, 10);
  // Synthetic verified accounts bypass outbound registration mail, never authentication.
  for (const userId of [id, other]) await db.user.create({ data: { id: userId, email: `${userId}@s18.invalid`, name: "Profesional de prueba S18", role: "CUSTOMER", emailVerified: new Date(), passwordHash,
    terraqoProfessionalProfile: { create: { visibility: "PRIVATE", liveCvEnabled: false } } } });
  const profile = await db.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: id } });
  const storage = path.join(local, "app/.next/local-media/terraqo-professional-documents");
  const documentRows = () => db.terraqoProfessionalDocument.findMany({ where: { professionalProfileId: profile.id }, orderBy: { uploadedAt: "asc" } });
  const usage = async () => (await db.terraqoUsageBucket.findUnique({ where: { ownerKey_period_metric: { ownerKey: `user:${id}`, period: "retained", metric: "storage-mb" } } }))?.used ?? 0;
  async function snapshot() {
    return { documents: await documentRows(), attempts: await db.terraqoDocumentReplacementAttempt.findMany({ where: { professionalProfileId: profile.id }, orderBy: { id: "asc" } }),
      used: await usage(), pointer: (await db.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profile.id } })).cvUrl, files: await files(storage) };
  }
  const expectedBytes = new Map<string, Buffer>();
  async function retained(count: number, pointer: string | null) {
    const docs = await documentRows();
    assert.equal(docs.length, count);
    assert.equal(await usage(), count, "Each small retained file keeps its original one-MB reservation");
    assert.equal((await db.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profile.id } })).cvUrl, pointer);
    for (const doc of docs) {
      assert.equal(doc.type, "CV"); assert.equal(doc.workspaceId, null); assert.equal(doc.reviewStatus, "SUBMITTED"); assert.equal(doc.reviewNote, null);
      const file = path.resolve(storage, doc.storageKey);
      assert.ok(file.startsWith(storage + path.sep));
      assert.deepEqual(await readFile(file), expectedBytes.get(doc.id), "SQL storage key must resolve to exact uploaded bytes");
      assert.equal(doc.size, expectedBytes.get(doc.id)!.length);
    }
    const attempts = await db.terraqoDocumentReplacementAttempt.findMany({ where: { professionalProfileId: profile.id } });
    assert.equal(attempts.length, count - 1, "Exact retry must not allocate another attempt");
    assert.ok(attempts.every(attempt => attempt.state === "COMMITTED"));
    // Both the bytes and metadata are physical local files, not provider or storage mocks.
    assert.equal((await files(storage)).length, (await db.terraqoProfessionalDocument.count()) * 2);
  }
  const owner = await login(browser, origin, id, password, width, true);
  const outsider = await login(browser, origin, other, password, width);
  const anonymous = await browser.newContext({ baseURL: origin });
  const { page, ctx } = owner;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  let phase = "initial-upload";
  const postJson = (context: BrowserContext, target: string, command: Command, requestOrigin = origin) => context.request.post(target, { ...options, headers: { Origin: requestOrigin }, data: command });
  const postFile = (context: BrowserContext, target: string, command: Command, file: Upload) => context.request.post(target, { ...options, headers: { Origin: origin }, multipart: {
    expectedVersion: String(command.expectedVersion), operationKey: command.operationKey,
    file: { name: file.name, mimeType: file.mimeType, buffer: file.buffer },
  } });
  const panel = page.locator("#documentos-datos");
  async function capture(label: string) {
    await page.evaluate(async () => { await document.fonts.ready; });
    await panel.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Document viewport overflow ${width}`);
    await page.screenshot({ path: path.join(artifactDir, `documents-${width}-${label}.png`), fullPage: true });
    assert.deepEqual(errors, [], "Browser runtime errors");
  }
  async function download(documentId: string) {
    const response = await ctx.request.get(`${endpoint}/${documentId}`, options);
    assert.equal(response.status(), 200);
    assert.match(response.headers()["cache-control"], /no-store/);
    assert.equal(response.headers()["content-security-policy"], "sandbox");
    assert.deepEqual(await response.body(), expectedBytes.get(documentId));
  }
  async function uiPost(target: string, buttonName: string) {
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url() === origin + target && response.request().method() === "POST", { timeout: 90000 }),
      panel.getByRole("button", { name: buttonName, exact: true }).click(),
    ]);
    assert.equal(response.status(), 200, `UI ${buttonName} must succeed against real Next`);
    return response;
  }
  try {
    await expect(panel).toBeVisible();
    const pdf = await PDFDocument.create(); pdf.addPage().drawText("S18 disposable professional CV");
    const first: Upload = { name: "CV-inicial.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) };
    await panel.locator('input[name="cvFile"]').setInputFiles(first);
    await uiPost(endpoint, "Subir CV");
    const initial = (await documentRows())[0]; assert.ok(initial);
    expectedBytes.set(initial.id, first.buffer);
    await expect(panel.getByText(first.name, { exact: true })).toBeVisible();
    await retained(1, `${endpoint}/${initial.id}`);
    await download(initial.id);
    const untouched = await snapshot();
    assert.equal((await anonymous.request.get(`${endpoint}/${initial.id}`, options)).status(), 401);
    assert.equal((await outsider.ctx.request.get(`${endpoint}/${initial.id}`, options)).status(), 403);
    assert.equal((await ctx.request.post(endpoint, { ...options, headers: { Origin: origin }, multipart: { purpose: "cv", cvFile: { ...first } } })).status(), 409);
    const cmd = { expectedVersion: 1, operationKey: randomUUID() };
    assert.equal((await postJson(anonymous, `${endpoint}/${initial.id}/withdraw`, cmd)).status(), 401);
    assert.equal((await postJson(outsider.ctx, `${endpoint}/${initial.id}/withdraw`, cmd)).status(), 404);
    assert.equal((await postFile(outsider.ctx, `${endpoint}/${initial.id}/replacement`, cmd, first)).status(), 404);
    assert.equal((await postJson(ctx, `${endpoint}/${initial.id}/withdraw`, cmd, "https://foreign.invalid")).status(), 403);
    assert.deepEqual(await snapshot(), untouched, "Denied calls and duplicate initial upload must leave SQL/quota/files untouched");
    let posted = 0;
    const listener = (request: import("@playwright/test").Request) => { if (request.method() === "POST" && request.url().includes(endpoint)) posted++; };
    page.on("request", listener);
    await panel.getByRole("button", { name: "Nueva versión", exact: true }).click();
    await panel.getByRole("button", { name: "Cancelar", exact: true }).click();
    await panel.getByRole("button", { name: "Retirar documento", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await panel.getByRole("button", { name: "Cancelar", exact: true }).click();
    page.off("request", listener); assert.equal(posted, 0);
    await capture("initial");
    phase = "pdf-docx-replacement";
    const updated = await PDFDocument.create(); updated.addPage().drawText("S18 replacement PDF version two");
    const docx = createGenuineProfessionalDocxFixture("CV-final.docx");
    const replacements: Upload[] = [
      { name: "CV-version-2.pdf", mimeType: "application/pdf", buffer: Buffer.from(await updated.save()) },
      { name: docx.name, mimeType: docx.type, buffer: Buffer.from(await docx.arrayBuffer()) },
    ];
    let current = initial;
    let lastCommand: Command | undefined;
    let lastTarget = "";
    for (const [index, file] of replacements.entries()) {
      const predecessor = current;
      const target = `${endpoint}/${predecessor.id}/replacement`;
      await panel.getByRole("button", { name: "Nueva versión", exact: true }).click();
      await expect(panel.locator('input[name="file"]')).toHaveAttribute("accept", ".pdf,.docx");
      await panel.locator('input[name="file"]').setInputFiles(file);
      const response = await uiPost(target, "Guardar nueva versión");
      const data = (await response.json()).data as { id: string; replayed: boolean };
      assert.equal(data.replayed, false);
      const request = response.request();
      const body = request.postDataBuffer(); assert.ok(body);
      const form = await new Request(origin + target, { method: "POST", headers: { "Content-Type": request.headers()["content-type"] }, body: new Uint8Array(body) }).formData();
      const command = { expectedVersion: Number(form.get("expectedVersion")), operationKey: String(form.get("operationKey")) };
      assert.equal(command.expectedVersion, predecessor.lifecycleVersion); assert.match(command.operationKey, /^[a-f0-9-]{36}$/);
      lastCommand = command; lastTarget = target;
      expectedBytes.set(data.id, file.buffer);
      current = await db.terraqoProfessionalDocument.findUniqueOrThrow({ where: { id: data.id } });
      assert.equal(current.replacesDocumentId, predecessor.id);
      assert.deepEqual(await db.terraqoProfessionalDocument.findUnique({ where: { id: predecessor.id } }), predecessor, "Predecessor metadata/review retained exactly");
      await expect(panel.getByText(file.name, { exact: true })).toBeVisible();
      await retained(index + 2, `${endpoint}/${current.id}`);
      await download(predecessor.id); await download(current.id);
      const committed = await snapshot();
      // Real concurrent HTTP retries of the committed UI intent must not allocate/write/charge again.
      for (const replay of await Promise.all([postFile(ctx, target, command, file), postFile(ctx, target, command, file)])) {
        assert.equal(replay.status(), 200); assert.deepEqual((await replay.json()).data, { id: data.id, replayed: true });
      }
      assert.deepEqual(await snapshot(), committed, "Exact retries preserve attempts, rows, bucket and blob mtimes");
      assert.equal((await postFile(ctx, target, { ...command, operationKey: randomUUID() }, file)).status(), 409);
      assert.deepEqual(await snapshot(), committed, "Branch rejection has no storage/quota side effects");
      await capture(index === 0 ? "pdf-replaced" : "docx-replaced");
    }
    await expect(panel.getByRole("button", { name: "Previsualizar", exact: true })).toHaveCount(0);
    await panel.getByText("Versiones anteriores del CV", { exact: true }).click();
    await expect(panel.getByRole("link", { name: "Descargar versión anterior", exact: true })).toHaveCount(2);
    phase = "withdrawal-replay-retention";
    const target = `${endpoint}/${current.id}/withdraw`;
    await panel.getByRole("button", { name: "Retirar documento", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const response = await uiPost(target, "Confirmar retiro");
    const command = response.request().postDataJSON() as Command;
    const result = (await response.json()).data;
    assert.equal(result.replayed, false);
    await expect(panel.getByRole("button", { name: "Subir CV", exact: true })).toBeVisible();
    await expect(panel.locator(`a[href="${endpoint}/${current.id}"]`)).toHaveCount(0);
    await retained(3, null);
    const withdrawn = await snapshot();
    const retired = withdrawn.documents.find(doc => doc.id === current.id)!;
    assert.ok(retired.withdrawnAt); assert.equal(retired.withdrawnByUserId, id);
    assert.equal(retired.withdrawOperationKey, command.operationKey); assert.equal(retired.lifecycleVersion, current.lifecycleVersion + 1);
    for (const replay of await Promise.all([postJson(ctx, target, command), postJson(ctx, target, command)])) {
      assert.equal(replay.status(), 200); assert.deepEqual((await replay.json()).data, { ...result, replayed: true });
    }
    assert.equal((await postJson(ctx, target, { ...command, operationKey: randomUUID() })).status(), 409);
    assert.equal((await ctx.request.get(`${endpoint}/${current.id}`, options)).status(), 404);
    assert.equal((await ctx.request.get(`${endpoint}/${current.id}?inline=1`, options)).status(), 404);
    assert.equal((await outsider.ctx.request.get(`${endpoint}/${current.id}`, options)).status(), 403);
    assert.ok(lastCommand);
    const afterWithdrawal = await postFile(ctx, lastTarget, lastCommand, replacements[1]);
    assert.equal(afterWithdrawal.status(), 200); assert.deepEqual((await afterWithdrawal.json()).data, { id: current.id, replayed: true });
    assert.deepEqual(await snapshot(), withdrawn, "Replay cannot resurrect, erase audit/history, refund quota or rewrite retained bytes");
    await download(initial.id);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(panel.getByRole("button", { name: "Subir CV", exact: true })).toBeVisible();
    await panel.getByText("Versiones anteriores del CV", { exact: true }).click();
    await expect(panel.getByRole("link", { name: "Descargar versión anterior", exact: true })).toHaveCount(2);
    await expect(panel.getByText("Retirado · Historial conservado", { exact: true })).toBeVisible();
    await expect(panel.locator(`a[href="${endpoint}/${current.id}"]`)).toHaveCount(0);
    await capture("withdrawn-history");
    console.log(`PASS S18 documents ${width}: real UI login/upload/PDF+DOCX replacement/withdrawal; HTTP ownership+origin; exact replay, SQL quota/history and retained bytes`);
    return { width, documents: 3, committedAttempts: 2, usedUnits: await usage(), retainedSha256: [...expectedBytes.values()].map(sha), pageErrors: errors };
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, `documents-${width}-FAILED.png`), fullPage: true }).catch(() => {});
    console.error(`S18 document journey failed: width=${width} phase=${phase}`);
    throw error;
  } finally {
    await owner.ctx.close(); await outsider.ctx.close(); await anonymous.close();
    // No row/blob cleanup: these are retained records. The caller drops only its owned cluster.
  }
}

export async function verifyS18DocumentsLocal() {
  assert.equal(process.env.S18_OWNED_LOCAL, "synthetic-only");
  const local = await realpath(process.env.S18_OWNED_LOCAL_ROOT!);
  assert.equal(path.dirname(local), await realpath(os.tmpdir()));
  assert.ok(path.basename(local).startsWith("terraqo-s18-authenticated-"));
  const ownership = JSON.parse(await readFile(path.join(local, "ownership.json"), "utf8"));
  const origin = process.env.AUTH_URL!;
  assert.equal(origin, ownership.origin); assert.equal(new URL(origin).hostname, "127.0.0.1");
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.username, "s18_runtime"); assert.equal(Number(url.port), ownership.pgPort);
  for (const flag of ["TERRAQO_DOCUMENT_LIFECYCLE_V1", "TERRAQO_SCOPED_SHARING_V1"]) assert.equal(process.env[flag], "true");
  assert.equal(process.env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED, "false");
  assert.equal(process.env.CULQI_MODE, "test");
  for (const key of Object.keys(process.env)) assert.ok(!/^(?:NETLIFY|RESEND_API_KEY|CULQI_(?:PUBLIC|SECRET)_KEY|SMTP_)/.test(key), "Provider credentials forbidden");
  const artifactDir = path.resolve(process.env.S18_EVIDENCE_DIRECTORY!);
  await mkdir(artifactDir, { recursive: true });
  const db = new PrismaClient();
  let browser: Browser | undefined;
  const evidence: { documents: unknown[]; documentsPassed: boolean; accessPassed: boolean; source: string } = { documents: [], documentsPassed: false, accessPassed: false, source: ownership.source };
  try {
    const [identity] = await db.$queryRaw<Array<{ host: string; port: number; role: string; superuser: boolean; bypass: boolean; schemaCreate: boolean; attemptDelete: boolean; attemptInsert: boolean }>>`
      SELECT host(inet_server_addr()) AS host, inet_server_port() AS port, current_user AS role,
      r.rolsuper AS superuser, r.rolbypassrls AS bypass, has_schema_privilege(current_user,'icc','CREATE') AS "schemaCreate",
      has_table_privilege(current_user,'icc."TerraqoDocumentReplacementAttempt"','DELETE') AS "attemptDelete",
      has_table_privilege(current_user,'icc."TerraqoDocumentReplacementAttempt"','INSERT') AS "attemptInsert"
      FROM pg_roles r WHERE r.rolname=current_user`;
    assert.deepEqual(identity, { host: "127.0.0.1", port: ownership.pgPort, role: "s18_runtime", superuser: false, bypass: false, schemaCreate: false, attemptDelete: false, attemptInsert: true });
    browser = await chromium.launch({ headless: true });
    await verifyNoScriptSignIn(browser, origin);
    for (const width of [1440, 375]) evidence.documents.push(await documentJourney({ db, browser, origin, artifactDir, local, width }));
    evidence.documentsPassed = true;
    await writeFile(path.join(artifactDir, "journey.json"), JSON.stringify(evidence, null, 2));
    console.log("S18 parent access helper starting (separate fixture/coverage)");
    await verifyS18AccessLocal({ db, browser, origin, artifactDir });
    evidence.accessPassed = true;
  } finally {
    await browser?.close(); await db.$disconnect();
    await writeFile(path.join(artifactDir, "journey.json"), JSON.stringify(evidence, null, 2));
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  verifyS18DocumentsLocal().catch(error => {
    console.error("S18 authenticated acceptance failed", { name: error.name, code: error.code,
      diagnostic: /strict mode violation/.test(error.message) ? "ambiguous browser locator" : /Timeout|timeout/.test(error.message) ? "browser wait timeout" : error.name === "AssertionError" ? "acceptance assertion" : "runtime error",
      location: error.stack?.split("\n").filter((line: string) => /at .*s18-/.test(line)).slice(0, 5),
      actual: typeof error.actual === "number" ? error.actual : undefined, expected: typeof error.expected === "number" ? error.expected : undefined });
    process.exitCode = 1;
  });
