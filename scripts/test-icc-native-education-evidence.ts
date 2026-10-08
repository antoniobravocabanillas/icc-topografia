import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { getStore } from "@netlify/blobs";
import { prisma } from "../lib/prisma";
import { WORKLOG_EVIDENCE_STORE } from "../lib/server/media";
import { login, tapLabel, capture, shell, pause, snapshot, scroll } from "./native-android-controls";

let phase = "preflight";
async function picker(serial: string, name: string) {
  async function tap(label: string) {
    const node = [...(await snapshot(serial)).matchAll(/<node\b[^>]*>/g)].map(value => value[0])
      .find(value => value.includes(`text="${label}"`) || value.includes(`content-desc="${label}"`));
    assert.ok(node, "Own picker control unavailable.");
    const b = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/); assert.ok(b);
    shell(serial, `input tap ${Math.round((+b[1] + +b[3]) / 2)} ${Math.round((+b[2] + +b[4]) / 2)}`); await pause(700);
  }
  const xml = await snapshot(serial);
  if (!xml.includes(`text="${name}"`)) {
    await tap(xml.includes('content-desc="Show roots"') ? "Show roots" : "Mostrar raíces");
    await tap((await snapshot(serial)).includes('text="Downloads"') ? "Downloads" : "Descargas");
  }
  await tap(name);
}
async function waitFor(serial: string, text: string) {
  for (let i = 0; i < 25; i++) {
    if ((await snapshot(serial)).includes(text)) return;
    await pause(700);
  }
  assert.fail(`Own native state unavailable: ${text}`);
}

async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.ok(process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET, "Existing operational secret required.");
  const base = "https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/";
  const check = await fetch(base + "education/native-preflight/evidence", { redirect: "error", signal: AbortSignal.timeout(30000) });
  assert.equal(check.status, 401);
  const target = process.env.TERRAQO_NATIVE_PROOF_TARGET ?? "all";
  assert.ok(["all", "phone", "tablet"].includes(target));
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } }, modules: { some: { code: "PROFESSIONAL_NETWORK", active: true } } }, select: { id: true } });
  const helpers = await import(pathToFileURL(join(process.env.APPDATA!, "npm/node_modules/netlify-cli/dist/utils/command-helpers.js")).href);
  const [token] = await helpers.getToken(); assert.ok(token);
  const store = getStore({ name: WORKLOG_EVIDENCE_STORE, siteID: "2d38524a-44f9-4473-8a1f-9270e03bc2bf", token, consistency: "strong" });
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGMsAAAAASUVORK5CYII=", "base64");
  for (const [serial, label] of [["emulator-5554", "phone"], ["emulator-5556", "tablet"]] as const) {
    if (target !== "all" && target !== label) continue;
    assert.ok(/versionCode=26(?:\s|$)/.test(shell(serial, "dumpsys package com.terraqo.terraqo_mobile")), "Requires final Android026 APK.");
    assert.equal(shell(serial, "settings get global wifi_on").trim(), "1");
    const password = randomBytes(24).toString("hex"), email = `native-education-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { email, name: "Prueba formación Android", role: "CUSTOMER", emailVerified: new Date(), passwordHash: await bcrypt.hash(password, 12),
      terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } }, terraqoProfessionalProfile: { create: {} } }, select: { id: true, terraqoProfessionalProfile: { select: { id: true } } } });
    let educationId: string | undefined, cacheFile: string | undefined;
    const name = `Terraqo-formacion-${randomUUID()}.png`;
    let bearer = "";
    const request = (path: string, method = "GET", body?: string) => fetch(base + path, { method, body, headers: { authorization: `Bearer ${bearer}`, ...(body ? { "content-type": "application/json" } : {}) }, redirect: "error", signal: AbortSignal.timeout(90000) });
    try {
      phase = `${label}: own setup/login`;
      const education = await prisma.terraqoProfessionalEducation.create({ data: { professionalProfileId: user.terraqoProfessionalProfile!.id,
        institution: "Institución propia de prueba", degree: "Diplomado en topografía aplicada", field: "Formación ficticia ICC", visibility: "PRIVATE", evidence: ["Texto propio conservado"] } });
      educationId = education.id;
      const access = await request("login", "POST", JSON.stringify({ email, password })); assert.equal(access.status, 200); bearer = (await access.json()).data.token;
      shell(serial, `printf '${bytes.toString("base64")}' | base64 -d > /sdcard/Download/${name}`);
      shell(serial, `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/${name}`);
      await login(serial, email, password); await tapLabel(serial, "Abrir herramientas"); await tapLabel(serial, "Formación académica"); await tapLabel(serial, "Respaldos de formación");
      await waitFor(serial, "No hay archivos en esta lista"); capture(serial, `cv-education-empty-${label}.png`);
      phase = `${label}: own picker cancellation`;
      await tapLabel(serial, "Seleccionar archivo"); await pause(700); shell(serial, "input keyevent 4"); await pause(700);
      assert.equal(await prisma.terraqoEducationEvidenceAttempt.count({ where: { educationId, actorId: user.id } }), 0);
      await tapLabel(serial, "Seleccionar archivo"); await pause(700); await picker(serial, name);
      await tapLabel(serial, "Revisar envío"); capture(serial, `cv-education-confirm-${label}.png`); await tapLabel(serial, "Cancelar");
      assert.equal(await prisma.terraqoEducationEvidenceOperation.count({ where: { educationId, actorId: user.id } }), 0);
      phase = `${label}: own native upload`;
      if (process.env.TERRAQO_NATIVE_PROOF_OFFLINE === "1") {
        phase = `${label}: own offline uncertainty and explicit replay`;
        shell(serial, "svc wifi disable"); shell(serial, "svc data disable");
        await tapLabel(serial, "Revisar envío"); await tapLabel(serial, "Confirmar envío");
        await waitFor(serial, "Resultado por comprobar");
        assert.equal(await prisma.terraqoEducationEvidenceAttempt.count({ where: { educationId, actorId: user.id } }), 0);
        capture(serial, `cv-education-offline-${label}.png`);
        await tapLabel(serial, "Consultar recibo"); await pause(1000);
        assert.equal(await prisma.terraqoEducationEvidenceOperation.count({ where: { educationId, actorId: user.id } }), 0);
        shell(serial, "input keyevent 4"); await waitFor(serial, "Resultado pendiente"); await tapLabel(serial, "Cancelar");
        // Remove only this invocation's picker source. Replay must use the frozen
        // bytes already selected, not reread a source that is now absent.
        shell(serial, `rm -f /sdcard/Download/${name}`);
        shell(serial, "svc wifi enable"); shell(serial, "svc data enable"); await pause(1500);
        await tapLabel(serial, "Consultar recibo"); await pause(2000);
        assert.equal(await prisma.terraqoEducationEvidenceAttempt.count({ where: { educationId, actorId: user.id } }), 0);
        assert.ok((await snapshot(serial)).includes("Resultado por comprobar"));
        await tapLabel(serial, "Reenviar original"); await tapLabel(serial, "Reenviar original");
      } else {
        await tapLabel(serial, "Revisar envío"); await tapLabel(serial, "Confirmar envío");
      }
      await waitFor(serial, "Recepción confirmada"); capture(serial, `cv-education-received-${label}.png`);
      const rows = await prisma.terraqoEducationEvidence.findMany({ where: { educationId, uploadedById: user.id } }); assert.equal(rows.length, 1);
      const row = rows[0]; assert.equal(row.fileName, name); assert.equal(row.size, bytes.length);
      assert.deepEqual(Buffer.from((await store.getWithMetadata(row.storageKey, { type: "arrayBuffer" }))!.data), bytes);
      assert.equal(await prisma.terraqoEducationEvidenceOperation.count({ where: { educationId, actorId: user.id } }), 1);
      assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityType: "EducationEvidence", action: "CREATED", entityId: row.id } }), 1);
      const usage = () => prisma.terraqoUsageBucket.findFirstOrThrow({ where: { ownerKey: `user:${user.id}`, metric: "storage-mb", period: "retained" } });
      assert.equal((await usage()).used, 1);
      phase = `${label}: own native bounded download`;
      await tapLabel(serial, "Abrir archivo"); await pause(1500);
      cacheFile = `cache/terraqo_private_files/terraqo-education-evidence-${row.id}.png`;
      let cached = false;
      for (let i = 0; i < 60; i++) { cached = shell(serial, `run-as com.terraqo.terraqo_mobile sh -c 'test -f ${cacheFile} && echo ready || echo pending'`).trim() === "ready"; if (cached) break; await pause(700); }
      assert.ok(cached, "Own private downloaded file required.");
      assert.equal(shell(serial, `run-as com.terraqo.terraqo_mobile cat ${cacheFile} | base64`).replace(/\s/g, ""), bytes.toString("base64"));
      const focus = shell(serial, "dumpsys window").split("\n").find(line => line.includes("mCurrentFocus")) ?? "";
      if (!focus.includes("com.terraqo.terraqo_mobile")) { shell(serial, "input keyevent 4"); await pause(700); }
      else assert.ok((await snapshot(serial)).includes("Instala una aplicación compatible"));
      phase = `${label}: protected own read`;
      await prisma.terraqoProfessionalEducation.update({ where: { id: educationId }, data: { verificationStatus: "APPROVED" } });
      shell(serial, "input keyevent 4"); await pause(700); await tapLabel(serial, "Respaldos de formación"); await waitFor(serial, "Formación verificada");
      assert.ok((await snapshot(serial)).includes(name));
      for (let i = 0; i < 4; i++) await scroll(serial);
      const selection = [...(await snapshot(serial)).matchAll(/<node\b[^>]*>/g)].map(value => value[0]).find(value => value.includes('content-desc="Seleccionar archivo'));
      assert.ok(selection?.includes('enabled="false"')); capture(serial, `cv-education-protected-${label}.png`);
      await prisma.terraqoProfessionalEducation.update({ where: { id: educationId }, data: { verificationStatus: "NOT_REQUESTED" } });
      shell(serial, "input keyevent 4"); await pause(700); await tapLabel(serial, "Respaldos de formación");
      phase = `${label}: own logical withdrawal`;
      await tapLabel(serial, "Retirar"); await tapLabel(serial, "Cancelar"); assert.equal(await prisma.terraqoEducationEvidenceWithdrawal.count({ where: { educationId, actorId: user.id } }), 0);
      await tapLabel(serial, "Retirar"); await tapLabel(serial, "Confirmar retirada"); await waitFor(serial, "Retirada confirmada"); capture(serial, `cv-education-withdrawn-${label}.png`);
      assert.equal(await prisma.terraqoEducationEvidence.count({ where: { educationId } }), 0);
      assert.equal(await prisma.terraqoEducationEvidenceWithdrawal.count({ where: { educationId, actorId: user.id } }), 1);
      assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityType: "EducationEvidenceWithdrawal", action: "DELETED" } }), 1);
      const attempt = await prisma.terraqoEducationEvidenceAttempt.findFirstOrThrow({ where: { educationId, actorId: user.id, storageKey: row.storageKey } });
      // Target only this invocation's attempt. Never call DISPATCH or a cron.
      const recovered: Response = await fetch("https://api.terraqoglobal.com/api/internal/education-evidence-cleanup", { method: "POST", headers: { authorization: `Bearer ${process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET}`, "content-type": "application/json" }, body: JSON.stringify({ action: "RECOVER", attemptId: attempt.id }), redirect: "error", signal: AbortSignal.timeout(55000) });
      assert.equal(recovered.status, 200); assert.equal((await usage()).used, 0); assert.equal(await store.get(row.storageKey), null);
      const retained = await prisma.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: educationId } }); assert.equal(retained.visibility, "PRIVATE"); assert.deepEqual(retained.evidence, ["Texto propio conservado"]);
      assert.equal((await prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: user.terraqoProfessionalProfile!.id } })).liveCvEnabled, false);
      phase = `${label}: own logout cache`;
      shell(serial, "input keyevent 4"); await pause(500); shell(serial, "input keyevent 4"); await pause(500); shell(serial, "input keyevent 4"); await pause(500);
      await tapLabel(serial, "Cuenta"); await tapLabel(serial, "Cerrar sesión"); await waitFor(serial, "Ingresar a mi empresa");
      assert.equal(shell(serial, `run-as com.terraqo.terraqo_mobile sh -c 'test -e ${cacheFile} && echo retained || echo removed'`).trim(), "removed");
      console.log(`PASS own native education ${label}${process.env.TERRAQO_NATIVE_PROOF_OFFLINE === "1" ? " offline uncertainty/GET-null/no autoPOST/source removed/frozen replay" : " nominal"}: cancellation, one upload/file/audit/quota, private bounded bytes, protected read, logical withdrawal receipt/audit, targeted refund and logout cache.`);
    } finally {
      if (educationId) {
        const blobs = await store.list({ prefix: `education-evidence/${educationId}/` });
        for (const blob of blobs.blobs) await store.delete(blob.key);
        await prisma.$transaction(async tx => {
          await tx.terraqoEducationEvidenceWithdrawal.deleteMany({ where: { educationId, actorId: user.id } });
          await tx.terraqoEducationEvidenceOperation.deleteMany({ where: { educationId, actorId: user.id } });
          await tx.terraqoEducationEvidence.deleteMany({ where: { educationId, uploadedById: user.id } });
          await tx.terraqoEducationEvidenceAttempt.deleteMany({ where: { educationId, actorId: user.id } });
          await tx.activityLog.deleteMany({ where: { actorId: user.id, terraqoWorkspaceId: workspace.id, entityType: { in: ["EducationEvidence", "EducationEvidenceWithdrawal"] } } });
          await tx.terraqoUsageBucket.deleteMany({ where: { ownerKey: `user:${user.id}` } });
          await tx.verificationToken.deleteMany({ where: { identifier: { in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`] } } });
          await tx.user.delete({ where: { id: user.id, email } });
        }, { timeout: 15000 });
      } else await prisma.user.delete({ where: { id: user.id, email } });
      assert.equal(await prisma.user.count({ where: { id: user.id } }), 0);
      if (educationId) {
        assert.equal(await prisma.terraqoProfessionalEducation.count({ where: { id: educationId } }), 0);
        assert.equal(await prisma.terraqoEducationEvidenceWithdrawal.count({ where: { educationId } }), 0);
        assert.equal(await prisma.terraqoEducationEvidenceAttempt.count({ where: { educationId } }), 0);
        assert.equal((await store.list({ prefix: `education-evidence/${educationId}/` })).blobs.length, 0);
      }
      if (cacheFile) { assert.match(cacheFile, /^cache\/terraqo_private_files\/terraqo-education-evidence-[A-Za-z0-9_-]+\.png$/); shell(serial, `run-as com.terraqo.terraqo_mobile rm -f ${cacheFile}`); }
      shell(serial, `rm -f /sdcard/Download/${name}`); shell(serial, "rm -f /sdcard/terraqo-native-test.xml"); shell(serial, "svc wifi enable"); shell(serial, "svc data enable"); shell(serial, "am force-stop com.terraqo.terraqo_mobile");
      console.log("CLEANUP only newly created own education fixture, withdrawal before receipts/attempts/parents; app stopped, radios enabled.");
    }
  }
}
main().catch(error => { console.error(`Native education phase: ${phase}`); console.error(error instanceof assert.AssertionError ? error.message : "Private diagnostics suppressed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
