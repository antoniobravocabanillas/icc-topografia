import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium, type BrowserContext } from "playwright";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as staging,
  workspaceAdministrationStagingSite as siteId } from "./lib/workspace-administration-test-target";
import { verifyClipPlayback } from "./lib/worklog-clip-playback";

export type ClipReceipt = { run: string; worklogId: string; owner: string;
  assets: Array<{ kind: "audio" | "video"; key: string; size: number; sha256?: string }> };

// The S22 build can hand the receipt to the local exact-key operator. Only DB
// fixtures are removed here. No management credential is requested in the build.
export async function verifyHostedWorklogClips(origin = staging) {
  assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "staging");
  const marker = await fetch(origin + "/__terraqo_s22_candidate.json", { redirect: "error", cache: "no-store" });
  assert.equal(marker.status, 200);
  const served = await marker.json();
  assert.equal(served.siteId, siteId);
  assert.match(served.commit, /^[a-f0-9]{40}$/);
  assert.equal(served.commit, process.env.S22_STAGING_CANDIDATE_SHA);
  const run = randomUUID();
  const owner = "clip-owner-" + run, peer = "clip-peer-" + run;
  const username = "clip-" + run;
  const operation = randomUUID(), title = "Prueba multimedia " + run;
  const receipt: ClipReceipt = { run, owner, worklogId: "", assets: [] };
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const browser = await chromium.launch();
  const password = randomBytes(24).toString("base64url");
  const headers = { Origin: origin };
  const options = { headers, maxRedirects: 0, timeout: 45_000 };
  let seeded = false;
  async function context(id?: string) {
    const ctx = await browser.newContext({ baseURL: origin, serviceWorkers: "block" });
    await ctx.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    if (id) {
      const csrf = await ctx.request.get("/api/auth/csrf", options);
      assert.equal(csrf.status(), 200);
      await ctx.request.post("/api/auth/callback/credentials", { ...options, headers: { ...headers, "X-Auth-Return-Redirect": "1" },
        form: { csrfToken: (await csrf.json()).csrfToken, email: id + "@example.invalid", password, callbackUrl: origin + "/portal" } });
      assert.equal((await (await ctx.request.get("/api/auth/session", options)).json()).user?.id, id);
    }
    return ctx;
  }
  async function playerPage(ctx: BrowserContext) {
    const page = await ctx.newPage();
    await page.route(origin + "/clip-test-player", route => route.fulfill({ contentType: "text/html", body: "<title>Clip fixture</title>" }));
    await page.goto(origin + "/clip-test-player");
    return page;
  }
  try {
    const [identity] = await db.$queryRaw<Array<{ role: string }>>`SELECT current_user AS role`;
    assert.equal(identity.role, "terraqo_staging_runtime");
    const hash = await bcrypt.hash(password, 10);
    await db.$transaction(async tx => {
      for (const id of [owner, peer]) {
        await tx.user.create({ data: { id, email: id + "@example.invalid", passwordHash: hash, emailVerified: new Date() } });
      }
      const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: owner, username, liveCvEnabled: true, liveCvVisibility: "PUBLIC" } });
      // Keep FIRST-worklog accounting outside this media test.
      await tx.terraqoWorklogEntry.create({ data: { id: "clip-seed-" + run, professionalProfileId: profile.id, authorId: owner,
        title: "Registro de control", summary: "Bitácora privada de control de la prueba.", occurredAt: new Date(), visibility: "PRIVATE" } });
    });
    seeded = true;
    console.log("WORKLOG_CLIP_RUN", run);
    const [writer, other, anon] = await Promise.all([context(owner), context(peer), context()]);
    const started = Date.now();
    const create = await writer.request.post("/api/terraqo/worklog", { ...options, headers: { ...headers, "Idempotency-Key": operation },
      data: { title, workDate: "2026-10-14", summary: "Registro de prueba para verificar archivos multimedia autorizados.", visibility: "PRIVATE" } });
    assert.equal(create.status(), 201);
    const entry = await db.terraqoWorklogEntry.findFirstOrThrow({ where: { id: (await create.json()).data.id, authorId: owner, title } });
    receipt.worklogId = entry.id;
    assert.equal(entry.occurredAt.toISOString(), "2026-10-14T05:00:00.000Z");
    assert.ok(entry.createdAt.getTime() >= started - 5000 && entry.createdAt.getTime() <= Date.now() + 5000);
    const ownerPage = await playerPage(writer);
    const ids: string[] = [];
    for (const kind of ["audio", "video"] as const) {
      const buffer = await readFile(`scripts/fixtures/worklog-clips/${kind}.webm`);
      const multipart = { photos: { name: `clip-${run}-${kind}.webm`, mimeType: kind + "/webm", buffer } };
      const upload = () => writer.request.post(`/api/terraqo/worklog/${entry.id}/evidence`, { ...options, multipart });
      const response = await upload();
      assert.equal(response.status(), 200);
      const id = (await response.json()).data.media[0].id;
      ids.push(id);
      const retry = await upload();
      assert.equal(retry.status(), 200);
      assert.equal((await retry.json()).data.media[0].id, id);
      const url = "/api/terraqo/worklog/evidence/" + id;
      assert.equal((await anon.request.get(url, options)).status(), 401);
      assert.equal((await other.request.get(url, options)).status(), 403);
      const full = await writer.request.get(url, options);
      assert.equal(full.status(), 200);
      assert.equal(full.headers()["content-type"], kind + "/webm");
      const bytes = await full.body();
      const row = await db.terraqoWorklogMedia.findFirstOrThrow({ where: { id, worklogId: entry.id } });
      assert.equal(row.size, bytes.length);
      receipt.assets.push({ kind, key: row.storageKey, size: row.size, sha256: createHash("sha256").update(bytes).digest("hex") });
      const partial = await writer.request.get(url, { ...options, headers: { ...headers, Range: "bytes=0-15" } });
      assert.equal(partial.status(), 206);
      assert.deepEqual(await partial.body(), bytes.subarray(0, 16));
      await verifyClipPlayback(ownerPage, kind, url);
      assert.equal((await anon.request.get(`/api/public/cv/${username}/worklogs/${id}`, options)).status(), 404);
    }
    const detail = `/cv/${username}/evidencias/${entry.id}`;
    assert.equal((await anon.request.get(detail, options)).status(), 404);
    // Publish only this run's synthetic row, then revoke it before cleanup.
    await db.terraqoWorklogEntry.update({ where: { id: entry.id, authorId: owner }, data: { visibility: "PUBLIC" } });
    const page = await anon.newPage();
    assert.equal((await page.goto(origin + detail))?.status(), 200);
    const gallery = page.getByRole("region", { name: "Galería de evidencias" });
    for (const [index, kind] of (["audio", "video"] as const).entries()) {
      await gallery.getByRole("button", { name: "Ver evidencia " + (index + 1) }).click();
      const src = await gallery.locator(kind + "[controls]").getAttribute("src");
      assert.equal(src, `/api/public/cv/${username}/worklogs/${ids[index]}`);
      await verifyClipPlayback(page, kind, src!);
    }
    await db.terraqoWorklogEntry.update({ where: { id: entry.id, authorId: owner }, data: { visibility: "PRIVATE" } });
    for (const id of ids) assert.equal((await anon.request.get(`/api/public/cv/${username}/worklogs/${id}`,
      { ...options, headers: { Range: "bytes=0-15" } })).status(), 404);
  } finally {
    try {
      if (seeded) {
        // Recover rows even if a POST committed and its HTTP response was lost.
        const entry = await db.terraqoWorklogEntry.findFirst({ where: { authorId: owner, title },
          include: { media: true } });
        if (entry) {
          receipt.worklogId = entry.id;
          for (const media of entry.media) {
            const kind = media.contentType === "audio/webm" ? "audio" : "video";
            assert.equal(media.fileName, `clip-${run}-${kind}.webm`);
            if (!receipt.assets.some(a => a.key === media.storageKey)) receipt.assets.push({ kind, key: media.storageKey, size: media.size });
          }
        }
        if (receipt.assets.length) console.log("WORKLOG_CLIP_CLEANUP", JSON.stringify(receipt));
        await db.$transaction(async tx => {
          await tx.terraqoWorklogCreateOperation.deleteMany({ where: { actorId: owner, operationKey: operation } });
          await tx.terraqoWorklogEntry.deleteMany({ where: { authorId: owner, id: { in: ["clip-seed-" + run, receipt.worklogId] } } });
          await tx.terraqoUsageBucket.deleteMany({ where: { ownerKey: "user:" + owner, period: "retained", metric: "storage-mb" } });
          for (const id of [owner, peer]) {
            await tx.verificationToken.deleteMany({ where: { identifier: "web-cv-session:" + id } });
            await tx.activityLog.deleteMany({ where: { actorId: id } });
            await tx.user.delete({ where: { id, email: id + "@example.invalid" } });
          }
        });
        assert.equal(await db.user.count({ where: { id: { in: [owner, peer] } } }), 0);
        assert.equal(await db.terraqoWorklogMedia.count({ where: { worklogId: receipt.worklogId } }), 0);
      }
    } finally { await browser.close(); await db.$disconnect(); }
  }
  return receipt;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  verifyHostedWorklogClips().then(() => console.log("HTTP playback and DB cleanup passed; physical cleanup requires the local receipt operator."))
    .catch(error => { console.error("Hosted clip check failed:", error instanceof Error ? error.name : "error",
      error instanceof Error ? error.stack?.match(/verify-hosted-worklog-clips\.ts:\d+:\d+/)?.[0] : ""); process.exitCode = 1; });
