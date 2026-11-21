import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { expect, type Browser } from "@playwright/test";
import { sharingSession } from "./s06-sharing-browser";

/** Only the caller's owned loopback cluster may contain these retained fixtures. */
export async function verifyS18AccessLocal(input: { db: PrismaClient; browser: Browser; origin: string; artifactDir: string }) {
  const { db, browser, origin, artifactDir } = input;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  const identity = await db.$queryRaw<{ host: string }[]>`SELECT host(inet_server_addr()) AS host`;
  assert.ok(identity.length === 1 && ["127.0.0.1", "::1"].includes(identity[0].host));
  const run = randomUUID();
  const ids = Array.from({ length: 3 }, () => "c" + randomBytes(12).toString("hex"));
  const [ownerId, recipientId, outsiderId] = ids;
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  for (const id of ids) await db.user.create({ data: { id, email: id + "@example.invalid", emailVerified: new Date(),
    name: id === ownerId ? "Titular de prueba" : "Destinatario de prueba", passwordHash, role: "CUSTOMER" } });
  const profile = await db.terraqoProfessionalProfile.create({ data: { userId: ownerId } });
  await db.terraqoProfessionalProfile.create({ data: { userId: outsiderId } });
  const workspace = await db.terraqoWorkspace.create({ data: { slug: "s18-plan-" + run, name: "Empresa de prueba S18",
    type: "CLIENT_COMPANY", ownerUserId: ownerId, members: { create: [
      { userId: ownerId, role: "OWNER", active: true }, { userId: outsiderId, role: "ADMIN", active: true },
    ] } } });
  const worklog = await db.terraqoWorklogEntry.create({ data: { authorId: ownerId, professionalProfileId: profile.id,
    title: "Título reservado " + run, summary: "Descripción autorizada " + run, lifecycle: "PUBLISHED", visibility: "PRIVATE" } });
  const revision = await db.terraqoWorklogRevision.create({ data: { worklogId: worklog.id, title: worklog.title,
    summary: worklog.summary, outcome: "Resultado no compartido " + run, revisionNo: 1, createdById: ownerId,
    contentHash: createHash("sha256").update(run).digest("hex") } });
  await db.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { currentRevisionId: revision.id } });
  const writer = await sharingSession(browser, origin, ownerId, password);
  const reader = await sharingSession(browser, origin, recipientId, password);
  const outsider = await sharingSession(browser, origin, outsiderId, password);
  const anonymous = await sharingSession(browser, origin);
  try {
    const title = "Selección autorizada " + run;
    const created = await writer.request.post(origin + "/api/v1/share-collections", {
      headers: { Origin: origin, "Idempotency-Key": randomUUID() },
      data: { title, items: [{ revisionId: revision.id, allowedFields: ["summary"], includeMedia: false }] },
    });
    assert.equal(created.status(), 201);
    const collection = (await created.json()).data as { id: string; version: number };
    const target = origin + "/api/v1/shared-selections/" + collection.id;
    assert.equal((await reader.request.get(target)).status(), 404);
    const grantReply = await writer.request.post(origin + `/api/v1/share-collections/${collection.id}/grants`, {
      headers: { Origin: origin, "Idempotency-Key": randomUUID() }, data: { expectedVersion: collection.version,
        subjectUserId: recipientId, scopes: ["VIEW_COLLECTION"], expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    assert.equal(grantReply.status(), 201);
    const grants = await db.terraqoAccessGrant.findMany({ where: { collectionId: collection.id } });
    assert.equal(grants.length, 1);
    const authorized = await reader.request.get(target);
    assert.equal(authorized.status(), 200);
    assert.match(authorized.headers()["cache-control"], /no-store/);
    const visible = (await authorized.json()).data;
    assert.deepEqual(visible.items, [{ worklogId: worklog.id, summary: worklog.summary, media: [] }]);
    assert.deepEqual(visible.capabilities, { downloadMedia: false });
    assert.equal((await outsider.request.get(target)).status(), 404);
    assert.equal((await anonymous.request.get(target)).status(), 401);
    // A separate deliberately expired fixture exercises actual server-time filtering.
    await db.terraqoAccessGrant.create({ data: { collectionId: collection.id, subjectUserId: outsiderId,
      issuedById: ownerId, scopes: ["VIEW_COLLECTION"], expiresAt: new Date(Date.now() - 60_000),
      operationKey: randomUUID(), operationFingerprint: createHash("sha256").update("expired-" + run).digest("hex") } });
    assert.equal((await outsider.request.get(target)).status(), 404);
    const foreignPage = await outsider.newPage();
    await foreignPage.goto(origin + "/portal/accesos");
    await expect(foreignPage.getByRole("article", { name: title, exact: true })).toHaveCount(0);
    const page = await writer.newPage();
    await page.goto(origin + "/portal/accesos");
    const item = page.getByRole("article", { name: title, exact: true });
    await expect(item.getByText("Vigente", { exact: true })).toBeVisible();
    await expect(item.getByText("Vencido", { exact: true })).toBeVisible();
    await expect(item.getByText("Ver selección", { exact: true }).first()).toBeVisible();
    let deletions = 0;
    page.on("request", request => { if (request.method() === "DELETE") deletions++; });
    await item.getByRole("button", { name: "Revocar acceso", exact: true }).click();
    await expect(item.getByText(/no recupera las copias/)).toBeVisible();
    await item.getByRole("button", { name: "Conservar acceso" }).click();
    assert.equal(deletions, 0);
    await mkdir(artifactDir, { recursive: true });
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(artifactDir, `access-${width}.png`), fullPage: true });
    }
    await item.getByRole("button", { name: "Revocar acceso", exact: true }).click();
    await item.getByRole("button", { name: "Confirmar revocación" }).click();
    await expect(page.getByRole("region", { name: "Accesos que has compartido", exact: true }).getByRole("status")).toContainText("Acceso revocado");
    assert.equal(deletions, 1);
    assert.equal((await reader.request.get(target)).status(), 404);
    const retained = await db.terraqoAccessGrant.findUniqueOrThrow({ where: { id: grants[0].id } });
    assert.equal(retained.lifecycle, "REVOKED");
    assert.ok(retained.revokedAt);
    await page.reload();
    await expect(item.getByText("Revocado", { exact: true })).toBeVisible();
    await expect(item.getByRole("button", { name: "Revocar acceso", exact: true })).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "Privacidad y cuenta" });
    await expect(nav.getByRole("link", { name: "Documentos privados" })).toHaveAttribute("href", "/portal/documentos");
    await expect(nav.getByRole("link", { name: "Mi plan y uso" })).toHaveAttribute("href", "/portal/membresia");
    // Read-only billing acceptance: no checkout, payment token, cancellation or provider key.
    const billingBefore = await db.terraqoBillingPayment.count();
    const accountBefore = await db.terraqoBillingAccount.count();
    for (const [context, expectedWorkspaces] of [[writer, [{ id: workspace.id, name: workspace.name }]], [outsider, []]] as const) {
      const result = await context.request.get(origin + "/api/terraqo/billing");
      assert.equal(result.status(), 200);
      assert.match(result.headers()["cache-control"], /private, no-store/);
      const data = await result.json();
      assert.equal(data.mode, "test");
      assert.equal(data.publicKey, null);
      assert.deepEqual(data.workspaces, expectedWorkspaces, "Tenant ADMIN does not imply company billing ownership");
    }
    assert.equal((await anonymous.request.get(origin + "/api/terraqo/billing")).status(), 401);
    await nav.getByRole("link", { name: "Mi plan y uso" }).click();
    await expect(page.getByRole("heading", { name: "Tu membresía, bajo tu control." })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Privacidad y cuenta" }).getByRole("link", { name: "Mi plan y uso" })).toHaveAttribute("aria-current", "page");
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(artifactDir, `plan-${width}.png`), fullPage: true });
    }
    assert.equal(await db.terraqoBillingPayment.count(), billingBefore);
    assert.equal(await db.terraqoBillingAccount.count(), accountBefore);
    assert.equal(await db.terraqoWorklogEntry.count({ where: { id: worklog.id, authorId: ownerId } }), 1);
    console.log("PASS S18 actual-login access inventory: exact fields, private/recipient/outsider, expiry, cancellation, durable revocation and responsive navigation");
    console.log("PASS S18 plan reads: owner-only company listing, no billing credentials, anonymous denial, no payment/account mutation or work loss");
  } finally {
    await Promise.all([writer, reader, outsider, anonymous].map(context => context.close()));
  }
}
