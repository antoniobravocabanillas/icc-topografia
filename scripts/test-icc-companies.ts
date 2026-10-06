import assert from "node:assert/strict";
import {randomBytes, randomUUID} from "node:crypto";
import bcrypt from "bcryptjs";
import {z} from "zod";
import {prisma} from "../lib/prisma";
import {listPortalResource, savePortalResource, PortalResourceError} from "../lib/server/portal-resources";
import {PortalCompanyError} from "../lib/server/portal-companies";
import type {WorkspacePortalToken} from "../lib/server/workspace-portal-session";
type Row = {id: string; updatedAt: string; fields: Record<string, string>; editable: boolean};
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({where: {slug: "icc-topografia", active: true, deletedAt: null,
    companies: {some: {document: "20616116313", deletedAt: null}}}, select: {id: true}});
  const run = randomUUID(), email = `companies-${run}@example.test`, password = randomBytes(24).toString("hex");
  const user = await prisma.user.create({data: {email, passwordHash: await bcrypt.hash(password, 12), name: "Prueba empresas comerciales", role: "CUSTOMER", emailVerified: new Date(),
    terraqoMemberships: {create: {workspaceId: workspace.id, role: "ADMIN", active: true}}}, select: {id: true}});
  const token: WorkspacePortalToken = {sub: user.id, workspaceId: workspace.id, workspaceSlug: "icc-topografia", role: "ADMIN", iat: 1, exp: 2};
  const ids: string[] = [], http = process.env.TEST_COMPANIES_HTTP === "1"; let bearer = "";
  const base = "https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal";
  const request = (path: string, body?: unknown, key?: string) => fetch(`${base}/${path}`, {method: body ? "POST" : "GET",
    headers: {"content-type": "application/json", authorization: `Bearer ${bearer}`, ...(key ? {"Idempotency-Key": key} : {})},
    body: body ? JSON.stringify(body) : undefined, redirect: "error", signal: AbortSignal.timeout(90000)});
  const save = async (fields: Record<string, string>, key = randomBytes(16).toString("hex"), before?: Row, status = 200) => {
    let result: Row | null = null;
    if (http) {
      const response = await request("resources/companies", {fields, ...(before ? {id: before.id, version: before.updatedAt} : {})}, key);
      assert.equal(response.status, status); if (status === 200) result = (await response.json()).data.record;
    } else {
      try { result = await savePortalResource(token, "companies", fields, key, before?.id, before?.updatedAt) as Row; assert.equal(status, 200); }
      catch (error) {const code = error instanceof PortalCompanyError || error instanceof PortalResourceError ? error.status : error instanceof z.ZodError ? 422 : null;
        if (code === null) throw error; assert.equal(code, status);}
    }
    if (result && !ids.includes(result.id)) ids.push(result.id); return result;
  };
  try {
    if (http) {const response = await request("login", {email, password}); assert.equal(response.status, 200); bearer = (await response.json()).data.token;}
    else for (const role of ["MEMBER", "CLIENT", "PROFESSIONAL", "VIEWER"] as const)
      await assert.rejects(listPortalResource({...token, role}, "companies"), error => error instanceof PortalResourceError && error.status === 403);
    const fields = {legalName: `Empresa temporal ${run}`, tradeName: "Equipo temporal", country: "PE", document: "",
      email: `COMPANY-${run}@example.test`, phone: "12345", address: "Direccion temporal", city: "Lima", region: "Lima", industry: "Topografia"};
    const key = randomBytes(16).toString("hex"), rows = await Promise.all(Array.from({length: 4}, () => save(fields, key)));
    const row = rows[0]!; assert.ok(rows.every(value => value!.id === row.id)); assert.equal(row.editable, true);
    assert.equal(row.fields.email, fields.email.toLowerCase());
    assert.equal(await prisma.activityLog.count({where: {actorId: user.id, entityId: row.id, action: "CREATED"}}), 1);
    await save({...fields, legalName: "Otro nombre"}, key, undefined, 409);
    await save({...fields, terraqoWorkspaceId: "foreign"}, undefined, undefined, 422);
    await save({...fields, country: "XX"}, undefined, undefined, 422);
    await save({...fields, document: "123"}, undefined, undefined, 422);
    const updated = (await save({...fields, tradeName: "Equipo actualizado", phone: ""}, undefined, row))!;
    assert.equal(updated.fields.phone, ""); await save(fields, undefined, row, 409);
    const document = `T-${run}`;
    const documented = (await save({...fields, country: "CO", document}))!;
    await save({...fields, country: "CO", document: document.toLowerCase()}, undefined, undefined, 409);
    await prisma.company.update({where: {id: documented.id}, data: {publicSlug: `test-${run}`}});
    const protectedRow = await prisma.company.findUniqueOrThrow({where: {id: documented.id}});
    await save({...fields, country: "CO", document}, undefined, {...documented, updatedAt: protectedRow.updatedAt.toISOString()}, 409);
    const page = http ? (await (await request("resources/companies")).json()).data : await listPortalResource(token, "companies");
    for (const value of page.records) {assert.ok(!("publicSlug" in value.fields)); assert.ok(!("_count" in value.fields));}
    assert.equal(await prisma.activityLog.count({where: {actorId: user.id, entityId: row.id, action: "UPDATED"}}), 1);
    console.log("PASS companies: admin scope, concurrent idempotency, normalized channels, document conflicts, strict fields/countries/RUC, stale edit, protected public identity, atomic audits.");
  } finally {
    await prisma.activityLog.deleteMany({where: {actorId: user.id, terraqoWorkspaceId: workspace.id, entityType: "companies"}});
    // Only deterministic records created by this temporary actor are removed.
    const owned = await prisma.company.findMany({where: {terraqoWorkspaceId: workspace.id, email: email.replace("companies-", "company-")}, select: {id: true}});
    await prisma.company.deleteMany({where: {terraqoWorkspaceId: workspace.id, id: {in: [...ids, ...owned.map(row => row.id)]}}});
    await prisma.verificationToken.deleteMany({where: {identifier: {in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where: {id: user.id}}); console.log("CLEANUP COMPANIES: owned temporary ICC companies, account, audits and sessions removed.");
  }
}
main().catch((error: unknown) => {console.error(error instanceof assert.AssertionError ? error.message : "Companies test failed; private diagnostics suppressed."); process.exitCode = 1;}).finally(() => prisma.$disconnect());
