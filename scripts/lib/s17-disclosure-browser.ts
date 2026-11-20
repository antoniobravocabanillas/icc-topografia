import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { expect as baseExpect, type BrowserContext, type Page } from "@playwright/test";
import { resolve } from "node:path";
import type { S16Fixture } from "./s16-collaboration-fixture";
const expect = baseExpect.configure({ timeout: 45000 });
type Row = { id: string; digest: string; status: string; workspaceApproved: boolean; professionalApproved: boolean };
export async function verifyDisclosureJourney(input: { origin: string; collaborationId: string; db: PrismaClient;
  f: S16Fixture; sessions: Record<"company" | "professional" | "other" | "anonymous", BrowserContext>;
  pages: [Page, Page]; artifactDir: string }) {
  const { origin, collaborationId: id, db, f, sessions: s, pages: [company, professional], artifactDir } = input;
  const base = `/api/v1/collaborations/${id}/certificate-disclosures`;
  async function send(ctx: BrowserContext, path: string, body: unknown, operationKey: string = randomUUID(), status = 200) {
    const r = await ctx.request.post(origin + path, { headers: { Origin: origin, "Idempotency-Key": operationKey }, data: body });
    assert.equal(r.status(), status, `${path}: ${r.status()}`); return (await r.json()).data as Row;
  }
  const read = async (row: Row, ctx = s.anonymous, status = 404) => {
    const r = await ctx.request.get(origin + `/api/v1/certificate-disclosures/${row.id}`);
    assert.equal(r.status(), status); assert.match(r.headers()["cache-control"], /no-store/);
    return (await r.json()).data;
  };
  const create = (payload: object, key = randomUUID()) => send(s.professional, base + "?view=professional", payload, key, 201);
  const decide = (row: Row, who: "company" | "professional", action: string, key: string = randomUUID(), status = 200) =>
    send(s[who], `${base}/${row.id}/decision?view=${who === "company" ? "workspace" : "professional"}`, { action, expectedDigest: row.digest }, key, status);
  const region = (page: Page) => page.getByRole("region", { name: "Compartir constancia", exact: true });
  await professional.reload({ waitUntil: "domcontentloaded" });
  const panel = region(professional);
  await expect(panel.getByRole("button", { name: "Preparar selección para autorizar" })).toBeEnabled();
  await panel.getByRole("checkbox", { name: "Contribución", exact: true }).uncheck();
  await panel.getByRole("checkbox", { name: "Resultado", exact: true }).uncheck();
  const [response] = await Promise.all([
    professional.waitForResponse(r => r.request().method() === "POST" && r.url() === origin + base + "?view=professional"),
    panel.getByRole("button", { name: "Preparar selección para autorizar" }).click(),
  ]);
  assert.equal(response.status(), 201);
  const first = (await response.json()).data as Row;
  assert.equal(first.status, "PENDING"); assert.equal(first.workspaceApproved, false); assert.equal(first.professionalApproved, false);
  await read(first);
  await company.reload({ waitUntil: "domcontentloaded" });
  await region(company).getByRole("button", { name: "Autorizar como empresa", exact: true }).click();
  await expect(region(company).getByText("Empresa · Autorizado", { exact: true })).toBeVisible();
  await read(first);
  await professional.reload({ waitUntil: "domcontentloaded" });
  await region(professional).getByRole("button", { name: "Autorizar como profesional", exact: true }).click();
  await expect(region(professional).getByText("Disponible", { exact: true })).toBeVisible();
  const publicValue = await read(first, s.anonymous, 200);
  assert.deepEqual(Object.keys(publicValue), ["fields"]); assert.deepEqual(Object.keys(publicValue.fields), ["scope"]);
  const visitor = await s.anonymous.newPage();
  await visitor.goto(origin + `/constancias/${first.id}`);
  await expect(visitor.getByText(publicValue.fields.scope, { exact: true })).toBeVisible();
  assert.equal(await visitor.locator("dt").count(), 1);
  for (const width of [1440, 375, 320]) {
    await professional.setViewportSize({ width, height: 1000 });
    assert.ok(await professional.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await region(professional).getByRole("heading", { name: "Compartir constancia", exact: true }).evaluate(el => el.scrollIntoView({ block: "start", behavior: "instant" }));
    await professional.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await professional.screenshot({ path: resolve(artifactDir, `disclosure-professional-${width}.png`) });
  }
  await send(s.other, `${base}/${first.id}/decision?view=workspace`, { action: "APPROVE", expectedDigest: first.digest }, randomUUID(), 404);
  await send(s.anonymous, `${base}/${first.id}/decision`, { action: "APPROVE", expectedDigest: first.digest }, randomUUID(), 401);
  await send(s.professional, `${base}/${first.id}/decision`, { action: "REVOKE", expectedDigest: "a".repeat(64) }, randomUUID(), 409);
  const csrf = await s.professional.request.post(origin + base, { headers: { Origin: "https://unrelated.invalid", "Idempotency-Key": randomUUID() }, data: { destination: "PUBLIC", fields: ["scope"] } });
  assert.equal(csrf.status(), 403);
  const huge = await s.professional.request.post(origin + base, { headers: { Origin: origin, "Idempotency-Key": randomUUID() }, data: { destination: "PUBLIC", fields: ["scope"], padding: "x".repeat(6000) } });
  assert.equal(huge.status(), 413);
  await assert.rejects(db.terraqoCertificateDisclosure.update({ where: { id: first.id }, data: { digest: "b".repeat(64) } }));
  const stored = await db.terraqoCertificateDisclosure.findUniqueOrThrow({ where: { id: first.id } });
  // SQL CHECK must reject NULL explicitly; UNKNOWN otherwise passes PostgreSQL checks.
  await assert.rejects(db.terraqoCertificateDisclosure.create({ data: {
    id: randomUUID(), certificateId: stored.certificateId, createdById: stored.createdById,
    destination: "INVITED", recipientUserId: f.otherOwner, recipientEmail: "fixture@example.invalid",
    expiresAt: null, snapshot: {}, digest: stored.digest,
  } }));
  console.log("S17_DISCLOSURE_STEP revoke-ui");
  await company.reload({ waitUntil: "domcontentloaded" });
  await region(company).getByRole("button", { name: "Revocar acceso", exact: true }).click();
  await expect(region(company).getByText(/no recupera copias/)).toBeVisible();
  const [revokedResponse] = await Promise.all([
    company.waitForResponse(r => r.request().method() === "POST" && r.url().includes(first.id + "/decision")),
    region(company).getByRole("button", { name: "Confirmar revocación", exact: true }).click(),
  ]);
  assert.equal(revokedResponse.status(), 200);
  const revokeKey = revokedResponse.request().headers()["idempotency-key"];
  assert.equal((await decide(first, "company", "REVOKE", revokeKey)).status, "REVOKED");
  await read(first); await decide(first, "professional", "APPROVE", randomUUID(), 409);
  console.log("S17_DISCLOSURE_STEP idempotency-membership");
  const proposal = { destination: "PUBLIC", fields: ["result"] }, createKey = randomUUID();
  const replay = await create(proposal, createKey); assert.equal((await create(proposal, createKey)).id, replay.id);
  await send(s.professional, base, { ...proposal, fields: ["scope"] }, createKey, 409);
  await decide(replay, "company", "APPROVE");
  const approveKey = randomUUID();
  const twins = await Promise.all([decide(replay, "professional", "APPROVE", approveKey), decide(replay, "professional", "APPROVE", approveKey)]);
  assert.ok(twins.every(v => v.status === "ACTIVE"));
  assert.equal(await db.terraqoCertificateDisclosureEvent.count({ where: { actorId: f.author, operationKey: approveKey } }), 1);
  const member = await db.terraqoWorkspaceMember.findFirstOrThrow({ where: { workspaceId: f.workspace, userId: f.owner } });
  await db.terraqoWorkspaceMember.update({ where: { id: member.id }, data: { active: false } });
  await read(replay);
  await db.terraqoWorkspaceMember.update({ where: { id: member.id }, data: { active: true } });
  await read(replay, s.anonymous, 200);
  const recipient = await db.user.findUniqueOrThrow({ where: { id: f.otherOwner } });
  console.log("S17_DISCLOSURE_STEP invitation-ui");
  await professional.reload({ waitUntil: "domcontentloaded" });
  await region(professional).getByText("Preparar otra selección", { exact: true }).click();
  await region(professional).getByLabel("2. Destino", { exact: true }).selectOption("INVITED");
  await region(professional).getByLabel("Correo del destinatario", { exact: true }).fill(recipient.email);
  await region(professional).getByLabel("Vence (hora de este dispositivo)", { exact: true }).fill("2099-12-31T12:00");
  const [invitedResponse] = await Promise.all([
    professional.waitForResponse(r => r.request().method() === "POST" && r.url() === origin + base + "?view=professional"),
    region(professional).getByRole("button", { name: "Preparar selección para autorizar", exact: true }).click(),
  ]);
  assert.equal(invitedResponse.status(), 201);
  const invite = (await invitedResponse.json()).data as Row;
  await decide(invite, "company", "APPROVE"); await decide(invite, "professional", "APPROVE");
  await read(invite); await read(invite, s.professional); await read(invite, s.other, 200);
  await db.user.update({ where: { id: recipient.id }, data: { emailVerified: null } }); await read(invite, s.other);
  await db.user.update({ where: { id: recipient.id }, data: { emailVerified: recipient.emailVerified } });
  const race = await create({ destination: "PUBLIC", fields: ["scope"] }); await decide(race, "company", "APPROVE");
  const outcomes = await Promise.all([
    s.professional.request.post(origin + `${base}/${race.id}/decision`, { headers: { Origin: origin, "Idempotency-Key": randomUUID() }, data: { action: "APPROVE", expectedDigest: race.digest } }),
    s.company.request.post(origin + `${base}/${race.id}/decision?view=workspace`, { headers: { Origin: origin, "Idempotency-Key": randomUUID() }, data: { action: "REVOKE", expectedDigest: race.digest } }),
  ]);
  assert.ok([200, 409].includes(outcomes[0].status())); assert.equal(outcomes[1].status(), 200); await read(race);
  // Hosted cold starts and two independent consent transactions must finish before
  // expiry; still wait for the real deadline and assert denial afterwards.
  const expiresAt = new Date(Date.now() + (new URL(origin).hostname === "terraqo-platform-staging.netlify.app" ? 90_000 : 12_000));
  const short = await create({ destination: "INVITED", fields: ["scope"], recipientEmail: recipient.email, expiresAt: expiresAt.toISOString() });
  await decide(short, "company", "APPROVE"); await decide(short, "professional", "APPROVE"); await read(short, s.other, 200);
  await new Promise(r => setTimeout(r, Math.max(0, expiresAt.getTime() - Date.now() + 100)));
  await read(short, s.other);
  assert.equal(await db.terraqoCollaborationCertificate.count({ where: { closure: { collaborationId: id }, privateByDefault: true } }), 1);
  await visitor.close();
  console.log("PASS S17 disclosure: UI dual approval, exact public projection, invited verified identity, expiry, revocation, live membership, CSRF/body limit, immutable DB, idempotency and approve/revoke races");
}
