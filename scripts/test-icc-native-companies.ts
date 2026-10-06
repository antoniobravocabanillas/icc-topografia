import assert from "node:assert/strict";
import {randomBytes, randomUUID} from "node:crypto";
import bcrypt from "bcryptjs";
import {prisma} from "../lib/prisma";
import {login, tapLabel, fillLabel, capture, scroll, shell, pause, snapshot} from "./native-android-controls";
let stage = "initialization";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({where: {slug: "icc-topografia", active: true, deletedAt: null,
    companies: {some: {document: "20616116313", deletedAt: null}}}, select: {id: true}});
  const run = randomUUID(), email = `native-companies-${run}@example.test`, password = randomBytes(24).toString("hex");
  const user = await prisma.user.create({data: {email, name: "Prueba empresas Android", role: "CUSTOMER", emailVerified: new Date(), passwordHash: await bcrypt.hash(password, 12),
    terraqoMemberships: {create: {workspaceId: workspace.id, role: "ADMIN", active: true}}}, select: {id: true}});
  const ids: string[] = [];
  try {
    for (const [index, serial] of ["emulator-5554", "emulator-5556"].entries()) {
      const device = index === 0 ? "phone" : "tablet", name = `Empresa-${device}-${run.slice(0,8)}`, companyEmail = `${device}-${run}@example.test`;
      stage = `${device}: login`; await login(serial, email, password); await tapLabel(serial, "Abrir herramientas");
      stage = `${device}: creation`; await tapLabel(serial, "Empresas comerciales"); await tapLabel(serial, "Crear empresa");
      await fillLabel(serial, "Razón social", name); await fillLabel(serial, "Nombre comercial", name);
      await fillLabel(serial, "Correo de la empresa", companyEmail); await fillLabel(serial, "Teléfono", "123456");
      for (let i = 0; i < 4; i++) await scroll(serial, true); capture(serial, `company-editor-${device}.png`);
      await tapLabel(serial, "Guardar"); let company = null;
      for (let attempt = 0; attempt < 12; attempt++) {company = await prisma.company.findFirst({where: {terraqoWorkspaceId: workspace.id, email: companyEmail}}); if (company) break; await pause(800);}
      assert.ok(company); ids.push(company.id); assert.equal(company.country, "PE"); assert.equal(company.phone, "123456"); assert.equal(company.publicSlug, null);
      assert.equal(await prisma.activityLog.count({where: {actorId: user.id, companyId: company.id, action: "CREATED"}}), 1);
      stage = `${device}: edit`; await tapLabel(serial, name); await fillLabel(serial, "Nombre comercial", "-editada");
      for (let i = 0; i < 4; i++) await scroll(serial, true); capture(serial, `company-edit-${device}.png`);
      await tapLabel(serial, "Guardar"); let edited = false;
      for (let attempt = 0; attempt < 12; attempt++) {const current = await prisma.company.findUniqueOrThrow({where: {id: company.id}});
        if (current.tradeName === `${name}-editada`) {assert.equal(current.legalName, name); edited = true; break;} await pause(800);}
      assert.ok(edited); assert.equal(await prisma.activityLog.count({where: {actorId: user.id, companyId: company.id, action: "UPDATED"}}), 1);
      shell(serial, "input keyevent 4"); await pause(600); await tapLabel(serial, "Contactos comerciales"); await tapLabel(serial, "Crear contacto");
      stage = `${device}: company selector`; await tapLabel(serial, "Sin seleccionar, Elegir empresa"); await tapLabel(serial, `${name}-editada`);
      assert.ok((await snapshot(serial)).includes(`${name}-editada`));
      for (let i = 0; i < 3; i++) {shell(serial, "input keyevent 4"); await pause(600);}
      stage = `${device}: logout`; await tapLabel(serial, "Cuenta"); await tapLabel(serial, "Cerrar sesión");
      let closed = false; for (let attempt = 0; attempt < 12; attempt++) {await pause(700); if ((await snapshot(serial)).includes("Ingresar a mi empresa")) {closed = true; break;}}
      assert.ok(closed); console.log(`PASS native companies ${device}: creation, country, edit, single audits, company visible in contact selector, logout.`);
    }
    assert.equal(await prisma.verificationToken.count({where: {identifier: `portal-session:${workspace.id}:${user.id}`}}), 0);
  } finally {
    const owned = await prisma.company.findMany({where: {terraqoWorkspaceId: workspace.id, email: {in: [`phone-${run}@example.test`, `tablet-${run}@example.test`]}}, select: {id: true}});
    await prisma.activityLog.deleteMany({where: {actorId: user.id, terraqoWorkspaceId: workspace.id, entityType: "companies"}});
    await prisma.company.deleteMany({where: {terraqoWorkspaceId: workspace.id, id: {in: [...ids, ...owned.map(row => row.id)]}}});
    await prisma.verificationToken.deleteMany({where: {identifier: {in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where: {id: user.id}});
    for (const serial of ["emulator-5554", "emulator-5556"]) shell(serial, "rm -f /sdcard/terraqo-native-test.xml");
    console.log("CLEANUP NATIVE COMPANIES: owned temporary ICC companies, account, audits and sessions removed.");
  }
}
main().catch((error: unknown) => {console.error(`Native companies stage: ${stage}`); console.error(error instanceof assert.AssertionError ? error.message : "Private diagnostics suppressed."); process.exitCode = 1;}).finally(() => prisma.$disconnect());
