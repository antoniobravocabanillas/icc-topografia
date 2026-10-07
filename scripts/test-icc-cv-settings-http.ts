import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { prisma } from "../lib/prisma";

let phase = "setup";
const portalOrigin = "https://portal.terraqoglobal.com";
const adminOrigin = "https://admin.terraqoglobal.com";
const cookieName = "__Secure-authjs.session-token";
function decode(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function actionForm(html: string, fields: string[]) {
  const forms = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)]
    .filter(form => fields.every(field => form[1].includes(`name="${field}"`)));
  assert.equal(forms.length, 1, "Exactly one intended form must exist");
  const data = new FormData();
  // Copy only the deployed action binding. Never copy foreign IDs or the
  // administrative allProjects checkbox from a page containing real records.
  for (const input of forms[0][1].matchAll(/<input\b[^>]*>/g)) {
    const name = input[0].match(/\bname="([^"]*)"/)?.[1];
    if (name?.startsWith("$ACTION_")) {
      const value = input[0].match(/\bvalue="([^"]*)"/)?.[1] ?? "";
      data.append(decode(name), decode(value));
    }
  }
  assert.ok([...data.keys()].some(key => key.startsWith("$ACTION_")));
  return { data, html: forms[0][1] };
}
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.ok(process.env.AUTH_SECRET);
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: {
    slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } },
  }, select: { id: true } });
  const run = randomUUID().replaceAll("-", "");
  const alias = `cv-http-${run.slice(0, 16)}`;
  const fixture = await prisma.$transaction(async tx => {
    const professional = await tx.user.create({ data: {
      email: `${alias}@example.test`, name: "Fixture privado CV HTTP", role: "CUSTOMER", emailVerified: new Date(),
      terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
      terraqoProfessionalProfile: { create: { username: alias, liveCvEnabled: false, liveCvVisibility: "PRIVATE" } },
    }, select: { id: true, email: true, terraqoProfessionalProfile: { select: { id: true } } } });
    const admin = await tx.user.create({ data: {
      email: `cv-admin-${run}@example.test`, name: "Fixture administrador CV HTTP", role: "ADMIN", emailVerified: new Date(),
      terraqoMemberships: { create: { workspaceId: workspace.id, role: "ADMIN", active: true } },
    }, select: { id: true, email: true } });
    const project = await tx.project.create({ data: {
      title: "Fixture privado CV HTTP", slug: `cv-http-${run}`, terraqoWorkspaceId: workspace.id,
      servicesApplied: [], summary: "Prueba temporal propia", description: "Prueba temporal propia", isPublic: false,
    }, select: { id: true } });
    return { professional, admin, project };
  }, { timeout: 15000 });
  const profileId = fixture.professional.terraqoProfessionalProfile!.id;
  try {
    const headers = async (user: { id: string; email: string }, role: "ADMIN" | "SUPER_ADMIN" | "CUSTOMER", origin: string) => {
      const session = await encode({ secret: process.env.AUTH_SECRET!, salt: cookieName, maxAge: 600,
        token: { sub: user.id, role, email: user.email, name: "Fixture privado" } });
      return { Cookie: `${cookieName}=${session}; terraqo_admin_workspace=${workspace.id}`, Origin: origin };
    };
    const portalHeaders = await headers(fixture.professional, "CUSTOMER", portalOrigin);
    let adminHeaders = await headers(fixture.admin, "ADMIN", adminOrigin);
    const authResponse = await fetch(adminOrigin + "/api/auth/session", { headers: adminHeaders, cache: "no-store", signal: AbortSignal.timeout(60000) });
    assert.equal(authResponse.status, 200);
    const authSession = await authResponse.json();
    assert.equal(authSession?.user?.id, fixture.admin.id); assert.equal(authSession?.user?.role, "ADMIN");
    // This network screen is restricted by the global layout. Verify that
    // boundary, then use only our disposable global reviewer for its real form.
    const denied = await fetch(adminOrigin + "/admin/terraqo/red", { headers: adminHeaders, redirect: "manual", signal: AbortSignal.timeout(60000) });
    assert.equal(denied.status, 307);
    assert.equal(new URL(denied.headers.get("location")!, adminOrigin).pathname, "/admin");
    await denied.body?.cancel();
    await prisma.user.update({ where: { id: fixture.admin.id }, data: { role: "SUPER_ADMIN" } });
    adminHeaders = await headers(fixture.admin, "SUPER_ADMIN", adminOrigin);
    const get = async (origin: string, path: string, requestHeaders: Record<string, string>) => {
      const response = await fetch(origin + path, { headers: requestHeaders, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(60000) });
      if (response.status !== 200) console.log(JSON.stringify({ phase, status: response.status, destination: response.headers.get("location") ? new URL(response.headers.get("location")!, origin).pathname : null }));
      assert.equal(response.status, 200, "Authenticated form must load");
      return response.text();
    };
    const post = async (origin: string, path: string, requestHeaders: Record<string, string>, data: FormData, result: string) => {
      const response = await fetch(origin + path, { method: "POST", body: data, headers: requestHeaders, redirect: "manual", signal: AbortSignal.timeout(60000) });
      assert.equal(response.status, 303, "Action must finish with its explicit success redirect");
      const location = response.headers.get("location");
      assert.ok(location);
      assert.equal(new URL(location, origin).searchParams.get(result.split("=")[0]), result.split("=")[1]);
      await response.body?.cancel();
    };
    const current = () => prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profileId },
      select: { userId: true, liveCvEnabled: true, liveCvVisibility: true, username: true, headline: true } });
    const settings = (html: string) => {
      const { data } = actionForm(html, ["username", "headline"]);
      data.set("username", alias); data.set("headline", "Perfil sintético guardado por HTTP");
      data.set("liveCvEnabled", "true"); data.set("liveCvVisibility", "PUBLIC"); data.set("userId", fixture.admin.id);
      return data;
    };
    for (const published of [false, true]) {
      phase = `settings preserve ${published}`;
      await prisma.terraqoProfessionalProfile.update({ where: { id: profileId }, data: { liveCvEnabled: published } });
      const html = await get(portalOrigin, "/configuracion", portalHeaders);
      assert.equal(html.includes("Ver CV público"), published);
      assert.equal(html.includes("CV sin publicar."), !published);
      await post(portalOrigin, "/configuracion", portalHeaders, settings(html), "success=settings");
      const saved = await current();
      assert.equal(saved.liveCvEnabled, published); assert.equal(saved.liveCvVisibility, "PRIVATE");
      assert.equal(saved.userId, fixture.professional.id); assert.equal(saved.username, alias);
      assert.equal(saved.headline, "Perfil sintético guardado por HTTP");
    }
    phase = "stale settings after withdrawal";
    const stale = settings(await get(portalOrigin, "/configuracion", portalHeaders));
    await prisma.terraqoProfessionalProfile.update({ where: { id: profileId }, data: { liveCvEnabled: false } });
    await post(portalOrigin, "/configuracion", portalHeaders, stale, "success=settings");
    assert.equal((await current()).liveCvEnabled, false);
    console.log("PASS authenticated deployed settings HTTP: publication/visibility preserved, forged fields ignored and stale form does not reactivate withdrawn CV.");

    for (const published of [false, true]) {
      phase = `admin link preserve ${published}`;
      await prisma.terraqoProfessionalProfile.update({ where: { id: profileId }, data: { liveCvEnabled: published } });
      phase = `admin page ${published}`;
      const html = await get(adminOrigin, "/admin/terraqo/red", adminHeaders);
      phase = `admin action binding ${published}`;
      const form = actionForm(html, ["professionalProfileId", "projectIds"]);
      phase = `admin own options ${published}`;
      assert.ok(form.html.includes(`value="${profileId}"`) && form.html.includes(`value="${fixture.project.id}"`));
      form.data.set("professionalProfileId", profileId); form.data.set("projectIds", fixture.project.id);
      const title = `Fixture HTTP ${published ? "publicado" : "retirado"}`;
      form.data.set("title", title); form.data.set("role", "Validación temporal");
      assert.equal(form.data.has("allProjects"), false);
      const before = await prisma.terraqoProfessionalExperience.count({ where: { professionalProfileId: profileId } });
      phase = `admin post ${published}`;
      await post(adminOrigin, "/admin/terraqo/red", adminHeaders, form.data, "status=experiencia-vinculada");
      phase = `admin SQL ${published}`;
      const experiences = await prisma.terraqoProfessionalExperience.findMany({ where: { professionalProfileId: profileId } });
      assert.equal(experiences.length, before + 1);
      const created = experiences.find(item => item.title === title);
      assert.ok(created); assert.equal(created.projectId, fixture.project.id);
      assert.equal(created.visibility, "WORKSPACE"); assert.equal(created.verifiedByTerraqo, true);
      const saved = await current();
      assert.equal(saved.liveCvEnabled, published); assert.equal(saved.liveCvVisibility, "PRIVATE");
    }
    console.log("PASS authenticated deployed administrative linking HTTP: only own project linked, verified WORKSPACE experience created and CV publication unchanged in both states.");
  } finally {
    await prisma.user.delete({ where: { id: fixture.professional.id } });
    await prisma.project.delete({ where: { id: fixture.project.id } });
    await prisma.user.delete({ where: { id: fixture.admin.id } });
    assert.equal(await prisma.terraqoProfessionalProfile.count({ where: { id: profileId } }), 0);
    assert.equal(await prisma.terraqoProfessionalExperience.count({ where: { professionalProfileId: profileId } }), 0);
    console.log("CLEANUP: only this run's two users, memberships, profile, experiences and private project removed.");
  }
}
main().catch(() => { console.error(`CV settings HTTP verification failed at ${phase}; private diagnostics suppressed.`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
