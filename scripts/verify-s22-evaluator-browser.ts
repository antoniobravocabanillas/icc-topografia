import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { BrowserContext } from "playwright";

// Called only by the destination-checked synthetic S22 browser suite.
export async function verifyEvaluatorBrowser(input: {
  db: PrismaClient; owner: BrowserContext; reviewer: BrowserContext; origin: string;
  workspaceId: string; ownerId: string; reviewerId: string; email: string; password: string;
}) {
  const { db, owner, reviewer, origin, workspaceId, ownerId, reviewerId, email } = input;
  const headers = { Origin: origin };
  const invites = "/api/terraqo/workspace-invitations";
  const access = "/api/terraqo/workspace-evaluators";
  const uuid = randomUUID();
  const create = await owner.request.post(invites, { headers, data: { action: "create", workspaceId, email, role: "EVALUATOR", canReadEvaluations: true, operationKey: uuid } });
  assert.equal(create.status(), 201);
  const issue = await create.json();
  assert.equal(issue.delivery, "disabled");
  const page = await reviewer.newPage();
  await page.goto(origin + "/invitacion-workspace#" + issue.token, { timeout: 120000 });
  const targetProfile = await db.terraqoProfessionalProfile.create({ data: { userId: reviewerId } });
  const entryId = randomUUID();
  try {
    await db.terraqoWorklogEntry.create({ data: { id: entryId, authorId: reviewerId, professionalProfileId: targetProfile.id,
      title: "Nivelación de control", summary: "Registro sintético de trayectoria.", occurredAt: new Date(), visibility: "PRIVATE" } });
    console.log("S01/S02: invitation opened");
    const popup = reviewer.waitForEvent("page");
    await page.getByRole("link", { name: "Iniciar sesión", exact: true }).click();
    const loginPage = await popup;
    loginPage.setDefaultTimeout(60_000);
    await loginPage.locator("#terraqo-login-panel input[name=email]").fill(email);
    await loginPage.locator("#terraqo-login-panel input[name=password]").fill(input.password);
    console.log("S01/S02: credential form ready");
    await loginPage.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await loginPage.waitForURL(origin + "/portal", { timeout: 90_000 });
    console.log("S01/S02: portal reached");
    const session = await (await reviewer.request.get("/api/auth/session")).json();
    assert.equal(session.user.id, reviewerId);
    for (const width of [1280, 375, 320]) {
      await loginPage.setViewportSize({ width, height: 900 });
      const trajectory = loginPage.getByRole("region", { name: "Mi trayectoria" });
      const pending = loginPage.getByRole("heading", { name: "Pendientes", exact: true });
      const recent = loginPage.getByRole("region", { name: "Actividad reciente" });
      await recent.getByText("Nivelación de control", { exact: true }).waitFor();
      await loginPage.getByRole("link", { name: /Documentos pendientes/ }).first().waitFor();
      const [a,b,c] = await Promise.all([trajectory.boundingBox(), pending.boundingBox(), recent.boundingBox()]);
      assert.ok(a && b && c);
      assert.ok(width >= 1024 ? b.x >= a.x+a.width : b.y >= a.y+a.height);
      assert.ok(c.y > b.y);
      assert.ok(await loginPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    console.log("S01/S02: trajectory inspected");
    await page.bringToFront();
    await page.getByText(email, { exact: true }).waitFor({ timeout: 60000 });
    assert.equal(await db.terraqoWorkspaceEvaluator.count({ where: { workspaceId, userId: reviewerId } }), 0);
    await loginPage.close();
    console.log("PASS S01 two tabs, real credential login and explicit invitation; S02 pending and recent activity at 1280/375/320.");
  } finally {
    await db.terraqoWorklogEntry.deleteMany({ where: { id: entryId, authorId: reviewerId } });
    await db.terraqoProfessionalProfile.deleteMany({ where: { id: targetProfile.id, userId: reviewerId } });
  }
  await page.getByRole("button", { name: "Aceptar invitación", exact: true }).click();
  await page.getByRole("link", { name: "Ver evaluaciones autorizadas", exact: true }).click();
  await page.getByRole("heading", { name: "Evaluaciones autorizadas", exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, "");
  assert.equal(await db.terraqoWorkspaceMember.count({ where: { workspaceId, userId: reviewerId } }), 0);
  const url = access + "?workspaceId=" + workspaceId;
  assert.equal((await reviewer.request.get(url)).status(), 403);
  const list = async () => {
    const response = await owner.request.get(url);
    assert.equal(response.status(), 200);
    const result = await response.json();
    const person = result.evaluators.find((item: { userId: string }) => item.userId === reviewerId);
    assert.ok(person);
    return person as { id: string; updatedAt: string };
  };
  const profileId = "profile-" + uuid;
  const ids = ["assigned-", "other-"].map(prefix => prefix + uuid);
  const needIds = ids.map(id => "need-" + id);
  const titles = ["Visita autorizada " + uuid, "Expediente privado " + uuid];
  const operation = () => ({ createdById: ownerId, operationKey: randomUUID(), operationFingerprint: uuid });
  try {
    await db.terraqoProfessionalProfile.create({ data: { id: profileId, userId: ownerId } });
    for (const [index,id] of ids.entries()) {
      const need = await db.terraqoWorkNeed.create({ data: { id: needIds[index], workspaceId, ...operation() } });
      const revision = await db.terraqoWorkNeedRevision.create({ data: { needId: need.id, revisionNo: 1, title: titles[index], problem: "Topografía", contentHash: uuid, ...operation() } });
      await db.terraqoEvaluationDossier.create({ data: { id, workspaceId, needRevisionId: revision.id, professionalProfileId: profileId, ...operation() } });
    }
    const person = await list();
    const data = { workspaceId, evaluatorId: person.id, active: true, canReadEvaluations: true, expectedUpdatedAt: person.updatedAt, dossierIds: [ids[0]] };
    assert.equal((await owner.request.patch(access, { headers: { Origin: "https://unrelated.invalid" }, data })).status(), 403);
    assert.equal((await reviewer.request.patch(access, { headers, data })).status(), 403);
    assert.equal((await owner.request.patch(access, { headers, data })).status(), 200);
    await page.reload();
    await page.getByText(titles[0], { exact: true }).waitFor({ timeout: 60000 });
    assert.equal(await page.getByText(titles[1], { exact: true }).count(), 0);
    const refreshed = await list();
    assert.equal((await owner.request.patch(access, { headers, data: { ...data, canReadEvaluations: false, dossierIds: [], expectedUpdatedAt: refreshed.updatedAt } })).status(), 200);
    assert.equal((await owner.request.patch(access, { headers, data })).status(), 409);
    await page.reload();
    assert.equal(await page.getByText(titles[0], { exact: true }).count(), 0);
    console.log("PASS evaluator HTTP/browser: verified acceptance, separate authority, explicit assignment, cross-origin denial, isolated list, revoked access and stale retry.");
  } finally {
    await db.$transaction([
      db.terraqoEvaluationDossier.deleteMany({ where: { workspaceId, id: { in: ids } } }),
      db.terraqoWorkNeed.deleteMany({ where: { workspaceId, id: { in: needIds } } }),
      db.terraqoProfessionalProfile.deleteMany({ where: { id: profileId, userId: ownerId } }),
    ]);
  }
}
