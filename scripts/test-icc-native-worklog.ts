import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { login, tapLabel, fillSentenceLabel, capture, shell, pause, snapshot } from "./native-android-controls";

let prisma: (typeof import("../lib/prisma"))["prisma"];

let phase = "preflight";
async function wait(serial: string, text: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await snapshot(serial)).includes(text)) return;
    await pause(1000);
  }
  throw new Error("Expected own native state unavailable");
}
async function fieldWorkspace(serial: string) {
  await tapLabel(serial, "Abrir herramientas"); await tapLabel(serial, "Actividad de campo");
}
async function newEntry(serial: string, title: string) {
  await tapLabel(serial, "Crear bitácora"); await wait(serial, "Nueva bitácora");
  await fillSentenceLabel(serial, "Título", title);
  await fillSentenceLabel(serial, "Detalle del trabajo", "Comprobé las cotas del proyecto y registré el control de campo realizado.");
  await fillSentenceLabel(serial, "Resultado (opcional)", "Control de campo completado.");
  await tapLabel(serial, "Revisar bitácora"); await wait(serial, "Revisar antes de enviar");
}
async function goHome(serial: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await snapshot(serial)).includes("Abrir herramientas")) return;
    shell(serial, "input keyevent 4"); await pause(600);
  }
  throw new Error("Own workspace navigation unavailable");
}
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  ({ prisma } = await import("../lib/prisma"));
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  for (const [serial, size] of [["emulator-5554","phone"],["emulator-5556","tablet"]] as const) {
    assert.ok(/versionCode=27(?:\s|$)/.test(shell(serial, "dumpsys package com.terraqo.terraqo_mobile")));
    const wifi = shell(serial, "settings get global wifi_on").trim();
    const mobile = shell(serial, "settings get global mobile_data").trim();
    assert.ok(["0","1"].includes(wifi) && ["0","1"].includes(mobile));
    const restore = () => { shell(serial, `svc wifi ${wifi === "1" ? "enable" : "disable"}`); shell(serial, `svc data ${mobile === "1" ? "enable" : "disable"}`); };
    const email = `own-native-worklog-${randomUUID()}@example.test`, password = randomBytes(24).toString("hex");
    const user = await prisma.user.create({ data: { email, name: "Prueba propia bitacora Android", role: "CUSTOMER", emailVerified: new Date(),
      passwordHash: await bcrypt.hash(password,12), terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
      terraqoProfessionalProfile: { create: { visibility: "PRIVATE", liveCvEnabled: false } } }, select: { id: true } });
    const count = () => prisma.terraqoNativeWorklogOperation.count({ where: { actorId: user.id } });
    try {
      phase = `${size}: login`; await login(serial,email,password); await fieldWorkspace(serial);
      await tapLabel(serial,"Crear bitácora"); await wait(serial,"Lo que realizaste"); capture(serial,`cv-worklog-editor-${size}.png`);
      await fillSentenceLabel(serial,"Título",`Control nominal ${size}`);
      await fillSentenceLabel(serial,"Detalle del trabajo","Comprobé las cotas del proyecto y registré el control de campo realizado.");
      await fillSentenceLabel(serial,"Resultado (opcional)","Control de campo completado.");
      await tapLabel(serial,"Revisar bitácora"); await wait(serial,"Revisar antes de enviar");
      assert.equal(await count(),0); capture(serial,`cv-worklog-review-${size}.png`);
      await tapLabel(serial,"Corregir contenido"); await tapLabel(serial,"Revisar bitácora"); assert.equal(await count(),0);
      phase = `${size}: nominal create`; await tapLabel(serial,"Guardar bitácora"); await wait(serial,"Bitácora guardada");
      assert.equal(await count(),1); capture(serial,`cv-worklog-confirmed-${size}.png`);
      await tapLabel(serial,"Volver a mis bitácoras"); await wait(serial,`Control nominal ${size}`);
      phase = `${size}: offline persistence`;
      await newEntry(serial,`Control recuperado ${size}`);
      shell(serial,"svc wifi disable"); shell(serial,"svc data disable"); await pause(1500);
      await tapLabel(serial,"Guardar bitácora"); await wait(serial,"Falta confirmar la recepción");
      assert.equal(await count(),1); capture(serial,`cv-worklog-uncertain-${size}.png`);
      // Restart the real app process: recover from encrypted storage, not a
      // surviving Dart controller. Restore radios even if a later assertion fails.
      shell(serial,"am force-stop com.terraqo.terraqo_mobile"); restore(); await pause(3000);
      shell(serial,"am start -n com.terraqo.terraqo_mobile/.MainActivity --ez enable-impeller false");
      await wait(serial,"Abrir herramientas"); await fieldWorkspace(serial); await tapLabel(serial,"Crear bitácora");
      await wait(serial,"Falta confirmar la recepción"); assert.equal(await count(),1);
      capture(serial,`cv-worklog-restored-${size}.png`);
      phase = `${size}: GET null and explicit resend`;
      await tapLabel(serial,"Comprobar recepción"); await wait(serial,"Aún no hay confirmación"); assert.equal(await count(),1);
      await tapLabel(serial,"Reenviar el mismo registro"); await wait(serial,"Se enviarán exactamente los datos");
      await tapLabel(serial,"Cancelar"); assert.equal(await count(),1);
      await tapLabel(serial,"Reenviar el mismo registro"); await tapLabel(serial,"Reenviar"); await wait(serial,"Bitácora guardada");
      assert.equal(await count(),2); capture(serial,`cv-worklog-recovered-${size}.png`);
      assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityType: "NativeWorklog" } }),2);
      assert.equal(await prisma.terraqoNativeWorklogAccounting.count({ where: { operation: { actorId: user.id }, state: "PENDING" } }),2);
      assert.equal(await prisma.terraqoWorklogEntry.count({ where: { authorId: user.id, visibility: "PRIVATE" } }),2);
      assert.equal(await prisma.terraqoBuilderAccount.count({ where: { userId: user.id } }),0);
      assert.equal(await prisma.terraqoBuilderLedger.count({ where: { account: { userId: user.id } } }),0);
      await tapLabel(serial,"Volver a mis bitácoras"); await goHome(serial); await tapLabel(serial,"Cuenta");
      await tapLabel(serial,"Cerrar sesión"); await wait(serial,"Ingresar a mi empresa");
      assert.equal(await prisma.verificationToken.count({ where: { identifier: `portal-session:${workspace.id}:${user.id}` } }),0);
      console.log(JSON.stringify({ outcome:"passed", native_size:size, nominal_create:true, offline_restart_recovery:true,
        get_null_without_post:true, explicit_resend:true, own_receipts:2, own_audits:2, accounting_credits:0, logout_verified:true }));
    } finally {
      restore();
      await prisma.verificationToken.deleteMany({ where: { identifier: { in: [`portal-session:${workspace.id}:${user.id}`,`portal-login-attempt:${workspace.id}:${user.id}`] } } });
      await prisma.terraqoNativeWorklogFirstDecision.deleteMany({ where: { actorId: user.id } });
      await prisma.terraqoNativeWorklogAuthority.deleteMany({ where: { actorId: user.id } });
      await prisma.terraqoNativeWorklogDecision.deleteMany({ where: { operation: { actorId: user.id } } });
      await prisma.terraqoNativeWorklogAccounting.deleteMany({ where: { operation: { actorId: user.id } } });
      await prisma.terraqoNativeWorklogOperation.deleteMany({ where: { actorId: user.id } });
      await prisma.terraqoBuilderContribution.deleteMany({ where: { userId: user.id } });
      await prisma.activityLog.deleteMany({ where: { actorId: user.id, entityType: "NativeWorklog" } });
      await prisma.user.delete({ where: { id: user.id } });
      assert.equal(await count(),0); assert.equal(await prisma.user.count({ where: { id: user.id } }),0);
      shell(serial,"rm -f /sdcard/terraqo-native-test.xml"); shell(serial,"am force-stop com.terraqo.terraqo_mobile");
      console.log(JSON.stringify({ native_size:size, own_fixtures_absent:true, radios_restored:true }));
    }
  }
}
main().catch(() => { console.error(JSON.stringify({ outcome:"failed", phase, private_diagnostics_suppressed:true })); process.exitCode=1; })
  .finally(() => prisma?.$disconnect());
