import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { login, tapLabel, capture, shell, pause, snapshot } from "./native-android-controls";

let phase = "fixture";
async function waitText(serial: string, text: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await snapshot(serial)).includes(text)) return;
    await pause(700);
  }
  throw new Error("Expected native publication state unavailable.");
}
async function waitEnabled(serial: string, label: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const node = [...(await snapshot(serial)).matchAll(/<node\b[^>]*>/g)].map(item => item[0])
      .find(item => item.includes(`content-desc="${label}`));
    if (node?.includes('enabled="true"')) return;
    await pause(700);
  }
  throw new Error("Native operation did not finish.");
}
async function logout(serial: string) {
  for (let level = 0; level < 3; level++) { shell(serial, "input keyevent 4"); await pause(600); }
  await tapLabel(serial, "Cuenta"); await tapLabel(serial, "Cerrar sesión"); await waitText(serial, "Ingresar a mi empresa");
}
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: {
    slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } },
  }, select: { id: true } });
  const networkProof = process.env.TERRAQO_NATIVE_CV_NETWORK_PROOF === "1";
  const releaseSmoke = process.env.TERRAQO_NATIVE_CV_RELEASE_SMOKE === "1";
  assert.ok(!(networkProof && releaseSmoke));
  for (const [serial, label] of [["emulator-5554", "phone"], ["emulator-5556", "tablet"]] as const) {
    if (releaseSmoke) assert.ok(/versionCode=25(?:\s|$)/.test(shell(serial, "dumpsys package com.terraqo.terraqo_mobile")));
    const wifi = shell(serial, "settings get global wifi_on").trim();
    const mobile = shell(serial, "settings get global mobile_data").trim();
    assert.ok(["0", "1"].includes(wifi) && ["0", "1"].includes(mobile));
    const restoreNetwork = () => {
      shell(serial, `svc wifi ${wifi === "1" ? "enable" : "disable"}`);
      shell(serial, `svc data ${mobile === "1" ? "enable" : "disable"}`);
    };
    const alias = `native-cv-${randomBytes(6).toString("hex")}`;
    const password = randomBytes(24).toString("hex");
    const email = `${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: {
      email, name: "Prueba privada CV Android", role: "CUSTOMER", emailVerified: new Date(), passwordHash: await bcrypt.hash(password, 12),
      terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
      terraqoProfessionalProfile: { create: { username: alias, liveCvEnabled: false, liveCvVisibility: "PRIVATE",
        experiences: { create: { title: "Experiencia sintética privada", companyName: "Fixture propio", visibility: "PRIVATE" } } } },
    }, select: { id: true, terraqoProfessionalProfile: { select: { id: true } } } });
    const profileId = user.terraqoProfessionalProfile!.id;
    const current = () => prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profileId }, select: { updatedAt: true, liveCvEnabled: true, experiences: { select: { visibility: true } } } });
    const count = () => prisma.terraqoCvPublicationOperation.count({ where: { professionalProfileId: profileId } });
    let bearer = "";
    const base = "https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/";
    const request = (path: string, body?: string) => fetch(base + path, {
      method: body ? "POST" : "GET", body, headers: { authorization: `Bearer ${bearer}`, ...(body ? { "content-type": "application/json" } : {}) },
      redirect: "error", signal: AbortSignal.timeout(60000),
    });
    try {
      phase = `${label}: HTTP login`;
      const access = await request("login", JSON.stringify({ email, password }));
      if (access.status !== 200) console.error(`Fixture HTTP login status ${access.status}.`);
      assert.equal(access.status, 200);
      bearer = (await access.json()).data.token;
      phase = `${label}: native login`;
      await login(serial, email, password);
      await tapLabel(serial, "Abrir herramientas"); await tapLabel(serial, "Mi perfil");
      await tapLabel(serial, "Publicación del CV"); await waitText(serial, "Tu CV está retirado");
      if (!networkProof && !releaseSmoke) capture(serial, `cv-publication-native-withdrawn-${label}.png`);
      const initial = await current();
      if (releaseSmoke) {
        phase = `${label}: release 0.25 default navigation`;
        await tapLabel(serial, "He revisado mi perfil"); await tapLabel(serial, "Revisar publicación");
        assert.equal(await count(), 0);
        await tapLabel(serial, "Cancelar revisión");
        assert.equal((await current()).updatedAt.toISOString(), initial.updatedAt.toISOString());
        await logout(serial);
        assert.ok(!(await snapshot(serial)).includes(alias));
        console.log(`PASS release 0.25 ${label}: default profile publication access, explicit consent/review/cancel without writes and logout.`);
        continue;
      }
      phase = `${label}: consent and cancel`;
      const xml = await snapshot(serial);
      const review = [...xml.matchAll(/<node\b[^>]*>/g)].map(item => item[0]).find(item => item.includes('content-desc="Revisar publicación'));
      assert.ok(review && review.includes('enabled="false"'));
      await tapLabel(serial, "He revisado mi perfil"); await tapLabel(serial, "Revisar publicación");
      assert.equal(await count(), 0); assert.equal((await current()).updatedAt.toISOString(), initial.updatedAt.toISOString());
      if (!networkProof) {
        await tapLabel(serial, "Cancelar revisión");
        assert.equal(await count(), 0);
        await tapLabel(serial, "He revisado mi perfil"); await tapLabel(serial, "Revisar publicación");
        capture(serial, `cv-publication-native-review-${label}.png`);
      }
      phase = `${label}: publish`;
      if (networkProof) {
        phase = `${label}: offline send`;
        // Disconnect only this owned AVD. Restore its original radio settings
        // before reconciliation and again in finally, even after assertion errors.
        shell(serial, "svc wifi disable"); shell(serial, "svc data disable"); await pause(1500);
        await tapLabel(serial, "Publicar mi CV"); await waitText(serial, "Por confirmar");
        await waitEnabled(serial, "Consultar resultado");
        assert.equal(await count(), 0); assert.equal((await current()).updatedAt.toISOString(), initial.updatedAt.toISOString());
        let uncertain = await snapshot(serial);
        assert.ok(!uncertain.includes("Tu CV está retirado") && !uncertain.includes("Tu CV está publicado"));
        capture(serial, `cv-publication-native-uncertain-${label}.png`);
        phase = `${label}: uncertain exit warning`;
        shell(serial, "input keyevent 4"); await waitText(serial, "Resultado pendiente de comprobar");
        assert.ok((await snapshot(serial)).includes("perderás esta comprobación por clave"));
        await tapLabel(serial, "Seguir comprobando");
        phase = `${label}: restored GET reconciliation`;
        restoreNetwork(); await pause(3000);
        await tapLabel(serial, "Consultar resultado"); await waitEnabled(serial, "Consultar resultado");
        uncertain = await snapshot(serial);
        assert.ok(uncertain.includes("Por confirmar") && !uncertain.includes("Revisa el resultado"));
        assert.equal(await count(), 0);
        capture(serial, `cv-publication-native-reconciled-pending-${label}.png`);
        phase = `${label}: explicit same-operation resend`;
        await tapLabel(serial, "Reenviar la misma operación");
      } else {
        await tapLabel(serial, "Publicar mi CV");
      }
      await waitText(serial, "Tu CV está publicado");
      capture(serial, `cv-publication-native-${networkProof ? "recovered" : "published"}-${label}.png`);
      assert.equal(await count(), 1);
      const published = await current(); assert.equal(published.liveCvEnabled, true); assert.ok(published.updatedAt > initial.updatedAt);
      assert.equal(published.experiences[0].visibility, "PRIVATE");
      assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityType: "CvPublication" } }), 1);
      const response = await request("cv-publication"); assert.equal(response.status, 200);
      assert.equal((await response.json()).data.current.published, true);
      if (!networkProof) {
        phase = `${label}: withdraw review`;
        await tapLabel(serial, "Revisar retiro"); assert.equal(await count(), 1);
        await tapLabel(serial, "Cancelar revisión"); assert.equal(await count(), 1);
        await tapLabel(serial, "Revisar retiro"); await tapLabel(serial, "Retirar mi CV"); await waitText(serial, "Tu CV está retirado");
        capture(serial, `cv-publication-native-withdraw-confirmed-${label}.png`);
        assert.equal(await count(), 2);
        const withdrawn = await current(); assert.equal(withdrawn.liveCvEnabled, false); assert.ok(withdrawn.updatedAt > published.updatedAt);
        assert.equal(withdrawn.experiences[0].visibility, "PRIVATE");
        const operations = await prisma.terraqoCvPublicationOperation.findMany({ where: { professionalProfileId: profileId }, orderBy: { createdAt: "asc" } });
        assert.deepEqual(operations.map(item => item.action), ["PUBLISH", "WITHDRAW"]);
        assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityType: "CvPublication" } }), 2);
        phase = `${label}: GET receipt and logout`;
        const receipt = await request(`cv-publication?operationKey=${operations[0].operationKey}`); assert.equal(receipt.status, 200);
        const checked = (await receipt.json()).data;
        assert.equal(checked.current.published, false); assert.equal(checked.receipt.published, true); assert.equal(await count(), 2);
      }
      await logout(serial);
      assert.ok(!(await snapshot(serial)).includes(alias));
      console.log(networkProof ? `PASS native network CV ${label}: offline uncertainty without stale-state claim, exit warning, restored GET without POST, explicit resend confirms one operation/audit, private entry preserved and logout.` : `PASS native CV ${label}: consent/cancel without writes, single publication and withdrawal, private entries preserved, historical GET receipt without POST and logout.`);
    } finally {
      if (networkProof) restoreNetwork();
      await prisma.activityLog.deleteMany({ where: { actorId: user.id, terraqoWorkspaceId: workspace.id, entityType: "CvPublication" } });
      await prisma.verificationToken.deleteMany({ where: { identifier: { in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`] } } });
      await prisma.user.delete({ where: { id: user.id } });
      shell(serial, "rm -f /sdcard/terraqo-native-test.xml"); shell(serial, "am force-stop com.terraqo.terraqo_mobile");
      assert.equal(await count(), 0);
      console.log("CLEANUP: own temporary user/profile/experience/membership/operations/audits/grants removed.");
    }
  }
}
main().catch(() => { console.error(`Native CV verification failed at ${phase}; private diagnostics suppressed.`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
