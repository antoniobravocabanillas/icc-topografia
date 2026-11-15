import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium, expect, type BrowserContext, type Page } from "@playwright/test";
import { assertWorkspaceAdministrationTestTarget } from "./lib/workspace-administration-test-target";
import type { AccountDraft } from "../lib/terraqo/worklog-account-draft";

const endpoint = "/api/terraqo/worklog/draft";

// Standalone or callable from the destination-checked staging suite. Each call owns its users and blob.
export async function verifyWorklogDraftConflict(origin: string) {
  assertWorkspaceAdministrationTestTarget(process.env, origin);
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const run = randomUUID();
  const profile = "draft-owner-" + run;
  const password = randomBytes(24).toString("base64url");
  const owned: string[] = [];
  let cleanupDraft: (() => Promise<void>) | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const hash = await bcrypt.hash(password, 10);
    for (const id of [profile, "draft-peer-" + run]) {
      await db.user.create({
        data: {
          id,
          email: id + "@example.invalid",
          passwordHash: hash,
          emailVerified: new Date(),
          terraqoProfessionalProfile: { create: { id } },
        },
      });
      owned.push(id);
    }
    browser = await chromium.launch();
    async function device(id?: string) {
      const ctx = await browser!.newContext({ baseURL: origin, serviceWorkers: "block" });
      await ctx.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      if (id) {
        const { csrfToken } = await (await ctx.request.get("/api/auth/csrf")).json();
        await ctx.request.post("/api/auth/callback/credentials", {
          maxRedirects: 0,
          headers: { Origin: origin, "X-Auth-Return-Redirect": "1" },
          form: { csrfToken, email: id + "@example.invalid", password, callbackUrl: origin + "/portal" },
        });
        assert.equal((await (await ctx.request.get("/api/auth/session")).json()).user?.id, id);
      }
      return ctx;
    }
    const a = await device(profile),
      b = await device(profile);
    const peer = await device(owned[1]),
      anonymous = await device();
    const headers = { "X-Draft-Profile": profile, Origin: origin };
    async function load(ctx: BrowserContext) {
      const response = await ctx.request.get(endpoint, { headers });
      assert.equal(response.status(), 200);
      assert.match(response.headers()["cache-control"], /private.*no-store/);
      return (await response.json()).draft as AccountDraft | null;
    }
    assert.equal(await load(a), null);
    cleanupDraft = async () => {
      const current = await load(a);
      if (current) {
        const discard = { action: "discard", base: current.revision };
        const response = await a.request.put(endpoint, { headers, data: discard });
        assert.equal(response.status(), 200);
        const empty = await response.json();
        assert.equal(empty.draft, null);
        assert.match(empty.revision, /^[a-f0-9]{64}$/);
        const replay = await b.request.put(endpoint, { headers, data: discard });
        assert.equal(replay.status(), 200);
        assert.deepEqual(await replay.json(), empty);
        const stale = await b.request.put(endpoint, {
          headers,
          data: { action: "save", fields: current.fields, base: null },
        });
        assert.equal(stale.status(), 409);
      }
      assert.equal(await load(b), null);
    };
    assert.equal((await anonymous.request.get(endpoint, { headers })).status(), 401);
    assert.equal((await peer.request.get(endpoint, { headers })).status(), 403);
    assert.equal((await peer.request.put(endpoint, { headers, data: {} })).status(), 403);
    const own = await peer.request.get(endpoint, { headers: { "X-Draft-Profile": owned[1] } });
    assert.equal(own.status(), 200);
    assert.equal((await own.json()).draft, null);
    assert.equal(
      (
        await a.request.put(endpoint, { headers: { ...headers, Origin: "https://other.invalid" }, data: {} })
      ).status(),
      403,
    );
    const first = await a.newPage(),
      second = await b.newPage();
    const title = (page: Page) => page.locator("#registrar-trabajo [name=title]");
    const date = (page: Page) => page.locator("#registrar-trabajo [name=workDate]");
    async function click(page: Page, label: string, method: string, status: number) {
      const response = page.waitForResponse(
        (r) => new URL(r.url()).pathname === endpoint && r.request().method() === method,
      );
      await page.getByRole("button", { name: label, exact: true }).click();
      assert.equal((await response).status(), status);
    }
    const save = "Guardar en mi cuenta",
      open = "Abrir borrador de mi cuenta";
    await first.goto("/portal/bitacora");
    await second.goto("/portal/bitacora");
    await title(first).fill("Base común");
    await date(first).fill("2026-10-10");
    await click(first, save, "PUT", 200);
    await click(second, open, "GET", 200);
    await expect(title(second)).toHaveValue("Base común");
    await expect(date(second)).toHaveValue("2026-10-10");
    await title(first).fill("Versión A");
    await click(first, save, "PUT", 200);
    await title(second).fill("Versión B");
    await date(second).fill("2026-10-11");
    await click(second, save, "PUT", 409);
    await expect(title(second)).toHaveValue("Versión B");
    assert.equal((await load(a))?.fields.title, "Versión A");
    // A changes again while B is comparing. Even an explicit resolution must still pass CAS.
    await title(first).fill("Última versión A");
    await click(first, save, "PUT", 200);
    await click(second, "Usar mi versión", "PUT", 409);
    await expect(second.getByText("Cuenta · Última versión A")).toBeVisible();
    await click(second, "Usar mi versión", "PUT", 200);
    let draft = (await load(a))!;
    assert.equal(draft.fields.title, "Versión B");
    assert.equal(draft.copies[0].title, "Última versión A");
    assert.equal(draft.copies[0].workDate, "2026-10-10");
    await title(first).fill("Edición posterior A");
    await click(first, save, "PUT", 409);
    await click(first, "Usar versión de la cuenta", "PUT", 200);
    await expect(title(first)).toHaveValue("Versión B");
    await expect(date(first)).toHaveValue("2026-10-11");
    await second.reload();
    await click(second, open, "GET", 200);
    await second.getByText("Copia 1 · Última versión A").click();
    await click(second, "Continuar con esta copia", "PUT", 200);
    await expect(title(second)).toHaveValue("Última versión A");
    draft = (await load(b))!;
    assert.deepEqual(draft.copies.map((copy) => copy.title).sort(), ["Edición posterior A", "Versión B"]);
    // Exercise acknowledgement loss through the public route.
    const retry = { action: "save", fields: { ...draft.fields, title: "Reintento" }, base: draft.revision };
    const put = () => b.request.put(endpoint, { headers, data: retry });
    const ack = await put(),
      replay = await put();
    assert.equal(ack.status(), 200);
    assert.equal(replay.status(), 200);
    assert.deepEqual(await ack.json(), await replay.json());
    assert.equal(
      (
        await a.request.put(endpoint, { headers, data: { action: "discard", base: draft.revision } })
      ).status(),
      409,
    );
    const prior = (await load(a))!;
    const race = await Promise.all(
      [a, b].map((ctx, i) =>
        ctx.request.put(endpoint, {
          headers,
          data: { action: "save", base: prior.revision, fields: { ...prior.fields, title: "Carrera " + i } },
        }),
      ),
    );
    assert.deepEqual(race.map((reply) => reply.status()).sort(), [200, 409]);
    const winner = await race.find((reply) => reply.status() === 200)!.json();
    assert.deepEqual(await load(b), winner.draft);
    assert.equal(await db.terraqoWorklogEntry.count({ where: { authorId: profile } }), 0);
  } finally {
    try {
      await cleanupDraft?.();
    } finally {
      try {
        await browser?.close();
      } finally {
        try {
          const grants = { identifier: { in: owned.map((id) => "web-cv-session:" + id) } };
          await db.$transaction([
            db.verificationToken.deleteMany({ where: grants }),
            db.user.deleteMany({ where: { id: { in: owned } } }),
          ]);
          assert.equal(await db.verificationToken.count({ where: grants }), 0);
          assert.equal(await db.terraqoProfessionalProfile.count({ where: { id: { in: owned } } }), 0);
          assert.equal(await db.user.count({ where: { id: { in: owned } } }), 0);
        } finally {
          await db.$disconnect();
        }
      }
    }
  }
  console.log(
    "PASS dos sesiones Auth.js, conflicto y resolución CAS en Chromium, fecha, copias, aislamiento, reintento y limpieza.",
  );
}

if (process.argv[1]?.endsWith("verify-worklog-draft-conflict.ts")) {
  verifyWorklogDraftConflict(process.argv[2] || "").catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
