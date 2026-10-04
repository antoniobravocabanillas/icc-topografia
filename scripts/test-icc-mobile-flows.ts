import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

const origin = "https://api.terraqoglobal.com";
const slug = "icc-topografia";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313", "Explicit ICC test scope is required.");
  const workspace = await prisma.terraqoWorkspace.findFirst({ where: { slug, active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  assert.ok(workspace, "ICC workspace and authorized RUC must match.");
  const run = randomUUID();
  const users: { id: string; token?: string }[] = [];
  const projectId = randomUUID(), taskId = randomUUID();
  let clientId: string | undefined;
  let privateFileId: string | undefined;
  const call = async (action: string, token?: string, body?: unknown, key?: string, method?: string) => {
    const headers = new Headers();
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (key) headers.set("Idempotency-Key", key);
    if (body && !(body instanceof FormData)) headers.set("content-type", "application/json");
    return fetch(`${origin}/api/public/workspaces/${slug}/portal/${action}`, { headers, method: method ?? (body ? "POST" : "GET"),
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: "error", signal: AbortSignal.timeout(90000) });
  };
  try {
    for (const role of ["MEMBER", "CLIENT", "PROFESSIONAL", "ADMIN"] as const) {
      const password = randomBytes(24).toString("hex");
      const email = `mobile-${role.toLowerCase()}-${run}@example.test`;
      const user: { id: string } = await prisma.user.create({ data: { email, name: "Prueba Android Terraqo", role: "CUSTOMER", passwordHash: await bcrypt.hash(password, 12),
        emailVerified: new Date(), terraqoMemberships: { create: { workspaceId: workspace.id, role, active: true } } }, select: { id: true } });
      const fixture: { id: string; token?: string } = { id: user.id }; users.push(fixture);
      const login = await call("login", undefined, { email, password }); assert.equal(login.status, 200, `Password login failed for ${role}.`);
      fixture.token = (await login.json()).data.token;
      assert.ok(fixture.token);
      const session = await call("session", fixture.token); assert.equal(session.status, 200);
      assert.equal((await session.json()).data.user.role, role.toLowerCase());
      if (role !== "ADMIN") assert.equal((await call("resources/clients", fixture.token)).status, 403);
      console.log(`PASS real password login: temporary ${role} account.`);
      if (role === "MEMBER") {
        const key = randomBytes(16).toString("hex");
        const fields = { title: "Prueba Android", body: "Contenido temporal de validación" };
        const created = await call("resources/notes", fixture.token, { fields }, key); assert.equal(created.status, 200);
        const note = (await created.json()).data.record;
        const replay = await call("resources/notes", fixture.token, { fields }, key); assert.equal(replay.status, 200);
        assert.equal((await replay.json()).data.record.id, note.id);
        const edited = await call("resources/notes", fixture.token, { id: note.id, version: note.updatedAt, fields: { ...fields, body: "Contenido actualizado" } });
        assert.equal(edited.status, 200);
        assert.equal((await call("resources/notes", fixture.token, { id: note.id, version: note.updatedAt, fields })).status, 409);
        const form = new FormData();
        form.set("title", `Prueba Android ${run}`); form.set("visibility", "PRIVATE"); form.set("category", "OTHER");
        form.set("file", new Blob(["Terraqo: prueba temporal"], { type: "text/plain" }), "terraqo-prueba.txt");
        const upload = await call("files", fixture.token, form); assert.equal(upload.status, 201, "Private file upload failed.");
        const file = (await upload.json()).data;
        privateFileId = file.id;
        const listed = (await (await call("resources/files", fixture.token)).json()).data.records;
        assert.equal(listed.find((row: { id: string }) => row.id === file.id)?.canDelete, true);
        const download = await call(`files/${file.id}`, fixture.token); assert.equal(download.status, 200);
        assert.equal(await download.text(), "Terraqo: prueba temporal");
        console.log("PASS real writes: private note create/replay/edit/stale rejection; private file upload/download.");
      }
      if (role === "PROFESSIONAL") {
        await prisma.terraqoProfessionalProfile.create({ data: { userId: user.id } });
        const page = (await (await call("resources/profile", fixture.token)).json()).data;
        assert.equal(page.canCreate, false); const profile = page.records[0];
        const fields = { headline: "Topógrafo", bio: "Perfil temporal de validación", status: "AVAILABLE",
          professionalCategories: "Ingeniería", specialties: "Topografía\nGeodesia", equipment: "", software: "", messagePrivacy: "NOBODY" };
        const command = { id: profile.id, version: profile.updatedAt, fields };
        const saved = await call("resources/profile", fixture.token, command); assert.equal(saved.status, 200);
        assert.equal((await saved.json()).data.record.fields.headline, fields.headline);
        assert.equal((await call("resources/profile", fixture.token, command)).status, 409);
        assert.equal((await call("resources/profile", fixture.token, { ...command, fields: { ...fields, bankCci: "123" } })).status, 422);
        const persisted = await prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { liveCvEnabled: true, liveCvVisibility: true, bankCci: true } });
        assert.equal(persisted.liveCvEnabled, false); assert.equal(persisted.liveCvVisibility, "PRIVATE"); assert.equal(persisted.bankCci, null);
        console.log("PASS real professional profile: edit, stale rejection, restricted-field rejection and publication privacy preserved.");
      } else assert.equal((await call("resources/profile", fixture.token)).status, 403);
      if (role === "ADMIN") {
        assert.ok(privateFileId);
        assert.equal((await call(`files/${privateFileId}`, fixture.token)).status, 404);
        assert.equal((await call(`files/${privateFileId}`, fixture.token, undefined, undefined, "DELETE")).status, 404);
        const key = randomBytes(16).toString("hex");
        clientId = createHash("sha256").update(JSON.stringify([workspace.id, user.id, "clients", key])).digest("hex").slice(0, 32);
        const fields = { name: `Prueba Android ${run}`, email: `client-${run}@example.test`, company: "Empresa de prueba", phone: "", status: "activo" };
        const created = await call("resources/clients", fixture.token, { fields }, key); assert.equal(created.status, 200);
        assert.equal((await created.json()).data.record.id, clientId);
        assert.equal((await call("resources/clients", fixture.token, { fields }, key)).status, 200);
        await prisma.project.create({ data: { id: projectId, title: "Proyecto temporal de validación Android", slug: `mobile-test-${run}`,
          terraqoWorkspaceId: workspace.id, summary: "Prueba temporal", description: "Prueba temporal", servicesApplied: [], isPublic: false,
          tasks: { create: { id: taskId, title: "Tarea temporal" } } } });
        const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { updatedAt: true } });
        const command = { id: taskId, version: task.updatedAt.toISOString(), fields: { title: "Tarea validada", description: "Prueba temporal", status: "DONE" } };
        const edited = await call("resources/tasks", fixture.token, command); assert.equal(edited.status, 200);
        const done = (await edited.json()).data.record; assert.equal(done.status, "DONE"); assert.ok(done.fields.completedAt);
        assert.equal((await call("resources/tasks", fixture.token, command)).status, 409);
        assert.equal(await prisma.activityLog.count({ where: { taskId, actorId: user.id, terraqoWorkspaceId: workspace.id } }), 1);
        console.log("PASS real enterprise writes: client creation/replay; task completion, audit and stale rejection.");
      }
    }
  } finally {
    // Remove only artifacts created by this run. Existing accounts and records
    // are never edited. File cleanup uses the authorized endpoint before logout.
    for (const user of users) {
      const files: { id: string }[] = await prisma.terraqoWorkspaceFile.findMany({ where: { workspaceId: workspace.id, userId: user.id }, select: { id: true } });
      for (const file of files) assert.equal((await call(`files/${file.id}`, user.token, undefined, undefined, "DELETE")).status, 200, "Temporary file cleanup failed.");
      if (user.token) {
        assert.equal((await call("logout", user.token, undefined, undefined, "POST")).status, 200);
        assert.equal((await call("session", user.token)).status, 401);
      }
      await prisma.verificationToken.deleteMany({ where: { identifier: { in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`] } } });
    }
    await prisma.activityLog.deleteMany({ where: { taskId, terraqoWorkspaceId: workspace.id, actorId: { in: users.map(user => user.id) } } });
    await prisma.project.deleteMany({ where: { id: projectId, terraqoWorkspaceId: workspace.id, slug: `mobile-test-${run}` } });
    if (clientId) await prisma.client.deleteMany({ where: { id: clientId, terraqoWorkspaceId: workspace.id } });
    for (const user of users) await prisma.user.delete({ where: { id: user.id } });
    console.log("CLEANUP: temporary accounts, grants, notes, private files, client, project, task and test audit removed.");
  }
}
main().catch((error: unknown) => { console.error(error instanceof assert.AssertionError ? error.message : "ICC flow verification failed; sensitive diagnostics suppressed."); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
