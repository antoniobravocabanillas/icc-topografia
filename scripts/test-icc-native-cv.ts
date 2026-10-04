import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { shell, snapshot, pause, login, tapLabel, fillLabel, capture, scroll } from "./native-android-controls";
let stage = "initialization";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirst({ where: { slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } }); assert.ok(workspace);
  const run = randomUUID(), email = `cv-native-${run}@example.test`, password = randomBytes(24).toString("hex");
  const user = await prisma.user.create({ data: { email, name: "Prueba CV Android", role: "CUSTOMER", emailVerified: new Date(), passwordHash: await bcrypt.hash(password, 12),
    terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } }, terraqoProfessionalProfile: { create: {} } }, select: { id: true } });
  try {
    for (const serial of ["emulator-5554", "emulator-5556"]) {
      stage = `${serial}: login`; await login(serial, email, password);
      stage = `${serial}: opening CV`; await tapLabel(serial, "Abrir herramientas"); await tapLabel(serial, "Formación académica");
      if (serial === "emulator-5554") {
        await tapLabel(serial, "Nuevo registro"); stage = `${serial}: filling education`;
        stage = `${serial}: institution`; await fillLabel(serial, "Institución", "Instituto-prueba");
        stage = `${serial}: degree`; await fillLabel(serial, "Título o programa", "Geomatica-prueba");
        stage = `${serial}: specialty`; await fillLabel(serial, "Especialidad", "Topografia");
        stage = `${serial}: start date`; await fillLabel(serial, "Fecha de inicio", "2020-01-01");
        stage = `${serial}: end date`; await fillLabel(serial, "Fecha de término", "2021-12-31");
        for (let index = 0; index < 3; index++) await scroll(serial, true);
        capture(serial, "cv-education-phone.png");
        stage = `${serial}: saving education`; await tapLabel(serial, "Guardar");
        for (let attempt = 0; attempt < 8; attempt++) {
          if (await prisma.terraqoProfessionalEducation.count({ where: { professionalProfile: { userId: user.id }, degree: "Geomatica-prueba" } })) break;
          await pause(1000);
        }
        const entries = await prisma.terraqoProfessionalEducation.findMany({ where: { professionalProfile: { userId: user.id }, degree: "Geomatica-prueba" }, select: { id: true, visibility: true, verificationStatus: true } });
        assert.equal(entries.length, 1); assert.equal(entries[0].visibility, "PRIVATE"); assert.equal(entries[0].verificationStatus, "NOT_REQUESTED");
        assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityId: entries[0].id, entityType: "ProfessionalCv" } }), 1);
      } else {
        stage = `${serial}: reading education`; await tapLabel(serial, "Geomatica-prueba");
        const xml = await snapshot(serial); assert.ok(xml.includes("Instituto-prueba")); assert.ok(xml.includes("Geomatica-prueba"));
        capture(serial, "cv-education-tablet.png"); shell(serial, "input keyevent 4"); await pause(500);
      }
      shell(serial, "input keyevent 4"); await pause(500); shell(serial, "input keyevent 4"); await pause(500);
      stage = `${serial}: logout`; await tapLabel(serial, "Cuenta"); await tapLabel(serial, "Cerrar sesión");
      let closed = false;
      for (let attempt = 0; attempt < 10; attempt++) { await pause(600); if ((await snapshot(serial)).includes("Ingresar a mi empresa")) { closed = true; break; } }
      assert.ok(closed); console.log(`PASS CV native ${serial}: education create/read across devices, private/unverified entry, audit and logout.`);
    }
    assert.equal(await prisma.verificationToken.count({ where: { identifier: `portal-session:${workspace.id}:${user.id}` } }), 0);
  } finally {
    await prisma.activityLog.deleteMany({ where: { actorId: user.id, terraqoWorkspaceId: workspace.id, entityType: "ProfessionalCv" } });
    await prisma.verificationToken.deleteMany({ where: { identifier: { in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`] } } });
    await prisma.user.delete({ where: { id: user.id } });
    for (const serial of ["emulator-5554", "emulator-5556"]) shell(serial, "rm -f /sdcard/terraqo-native-test.xml");
    console.log("CLEANUP CV: temporary account, profile, education, audit and grants removed.");
  }
}
main().catch((error: unknown) => { console.error(`CV native stage: ${stage}`); console.error(error instanceof assert.AssertionError ? error.message : "Native CV control failed; private diagnostics suppressed."); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
