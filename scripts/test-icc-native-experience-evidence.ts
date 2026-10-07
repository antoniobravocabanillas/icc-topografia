import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { getStore } from "@netlify/blobs";
import { prisma } from "../lib/prisma";
import { WORKLOG_EVIDENCE_STORE } from "../lib/server/media";
import { login, tapLabel, capture, shell, pause, snapshot, scroll } from "./native-android-controls";

let phase = "fixture";
async function pickerFile(serial: string, name: string) {
  async function tap(label: string) {
    const node = [...(await snapshot(serial)).matchAll(/<node\b[^>]*>/g)]
      .map(match => match[0]).find(value => value.includes(`text="${label}"`) || value.includes(`content-desc="${label}"`));
    assert.ok(node, "Synthetic picker control unavailable.");
    const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/); assert.ok(bounds);
    shell(serial, `input tap ${Math.round((+bounds[1] + +bounds[3]) / 2)} ${Math.round((+bounds[2] + +bounds[4]) / 2)}`);
    await pause(700);
  }
  let xml = await snapshot(serial);
  if (!xml.includes(`text="${name}"`)) {
    await tap(xml.includes('content-desc="Show roots"') ? "Show roots" : "Mostrar raíces");
    xml = await snapshot(serial);
    await tap(xml.includes('text="Downloads"') ? "Downloads" : "Descargas");
  }
  await tap(name);
}

async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({
    where: { slug: "icc-topografia", active: true, deletedAt: null,
      companies: { some: { document: "20616116313", deletedAt: null } },
      modules: { some: { code: "PROFESSIONAL_NETWORK", active: true } } }, select: { id: true },
  });
  const helpers = await import(pathToFileURL(join(process.env.APPDATA!, "npm/node_modules/netlify-cli/dist/utils/command-helpers.js")).href);
  const [token] = await helpers.getToken(); assert.ok(token);
  const store = getStore({ name: WORKLOG_EVIDENCE_STORE, siteID: "2d38524a-44f9-4473-8a1f-9270e03bc2bf", token, consistency: "strong" });
  const base = "https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/";
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGMsAAAAASUVORK5CYII=", "base64");
  const target = process.env.TERRAQO_NATIVE_PROOF_TARGET ?? "all";
  assert.ok(["all", "phone", "tablet"].includes(target));
  for (const [serial, label] of [["emulator-5554", "phone"], ["emulator-5556", "tablet"]] as const) {
    if (target !== "all" && target !== label) continue;
    assert.ok(/versionCode=24(?:\s|$)/.test(shell(serial, "dumpsys package com.terraqo.terraqo_mobile")), "Native proof requires the final version 0.24 APK.");
    const password = randomBytes(24).toString("hex"), email = `native-evidence-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { email, name: "Prueba evidencia Android", role: "CUSTOMER", emailVerified: new Date(),
      passwordHash: await bcrypt.hash(password, 12), terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
      terraqoProfessionalProfile: { create: {} } }, select: { id: true, terraqoProfessionalProfile: { select: { id: true } } } });
    const profileId = user.terraqoProfessionalProfile!.id;
    let experienceId: string | undefined;
    let cacheFile: string | undefined;
    let readerAttempted = false;
    const name = `Terraqo-evidencia-${label}-${randomBytes(4).toString("hex")}.png`;
    let bearer = "";
    const request = (path: string, method = "GET", body?: BodyInit) => fetch(base + path, {
      method, body, headers: { authorization: `Bearer ${bearer}`, ...(typeof body === "string" ? { "content-type": "application/json" } : {}) },
      redirect: "error", signal: AbortSignal.timeout(90000),
    });
    try {
      phase = `${serial}: setup/login`;
      const experience = await prisma.terraqoProfessionalExperience.create({ data: { professionalProfileId: profileId,
        title: "Levantamiento de campo", companyName: "Muestra sintética", role: "Topografía",
        summary: "Experiencia ficticia exclusiva para validar evidencias Android.", startedAt: new Date("2020-01-01T00:00:00Z"),
        endedAt: new Date("2021-12-31T00:00:00Z"), visibility: "PRIVATE" } });
      experienceId = experience.id;
      const path = `experiences/${experience.id}/evidence`;
      const access = await request("login", "POST", JSON.stringify({ email, password })); assert.equal(access.status, 200);
      bearer = (await access.json()).data.token;
      shell(serial, `printf '${bytes.toString("base64")}' | base64 -d > /sdcard/Download/${name}`);
      shell(serial, `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/${name}`);
      await login(serial, email, password);
      await tapLabel(serial, "Abrir herramientas"); await tapLabel(serial, "Experiencia laboral"); await tapLabel(serial, "Evidencias");
      for (let attempt = 0; attempt < 20; attempt++) { if ((await snapshot(serial)).includes("Todavía no hay evidencias")) break; await pause(700); }
      assert.ok((await snapshot(serial)).includes("Todavía no hay evidencias"));
      capture(serial, `cv-experience-evidence-empty-${label}.png`);
      phase = `${serial}: cancel/select/review`;
      await tapLabel(serial, "Seleccionar archivo"); await pause(700); shell(serial, "input keyevent 4"); await pause(700);
      assert.equal(await prisma.terraqoExperienceEvidence.count({ where: { experienceId } }), 0);
      await tapLabel(serial, "Seleccionar archivo"); await pause(700); await pickerFile(serial, name);
      assert.equal(await prisma.terraqoExperienceEvidence.count({ where: { experienceId } }), 0);
      assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityType: "ExperienceEvidence" } }), 0);
      if (label === "phone") await scroll(serial);
      capture(serial, `cv-experience-evidence-review-${label}.png`);
      phase = `${serial}: send`;
      await tapLabel(serial, "Enviar evidencia");
      for (let attempt = 0; attempt < 20; attempt++) { if ((await snapshot(serial)).includes("Evidencia recibida")) break; await pause(700); }
      assert.ok((await snapshot(serial)).includes("Evidencia recibida"));
      capture(serial, `cv-experience-evidence-success-${label}.png`);
      const rows = await prisma.terraqoExperienceEvidence.findMany({ where: { experienceId } }); assert.equal(rows.length, 1);
      const row = rows[0]; assert.equal(row.fileName, name); assert.equal(row.uploadedById, user.id); assert.equal(row.size, bytes.length);
      assert.deepEqual(Buffer.from((await store.getWithMetadata(row.storageKey, { type: "arrayBuffer" }))!.data), bytes);
      assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityType: "ExperienceEvidence", action: "CREATED", entityId: row.id } }), 1);
      assert.equal((await prisma.terraqoUsageBucket.findFirstOrThrow({ where: { ownerKey: `user:${user.id}`, metric: "storage-mb", period: "retained" } })).used, 1);
      const updated = await prisma.terraqoProfessionalExperience.findUniqueOrThrow({ where: { id: experienceId } });
      assert.equal(updated.verificationStatus, "NOT_REQUESTED"); assert.equal(updated.visibility, "PRIVATE"); assert.equal(updated.verifiedByTerraqo, false);
      assert.ok(updated.updatedAt > experience.updatedAt);
      const list = await request(path); assert.equal(list.status, 200); const data = (await list.json()).data;
      assert.equal(data.records.length, 1); assert.equal(data.records[0].id, row.id);
      const download = await request(`${path}/${row.id}`); assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
      assert.deepEqual(download.headers.get("cache-control")?.split(",").map(value => value.trim()), ["private", "no-store"]);
      assert.equal((await fetch(base + `${path}/${row.id}`, { redirect: "error", signal: AbortSignal.timeout(30000) })).status, 401);
      phase = `${serial}: native open`;
      readerAttempted = true;
      await tapLabel(serial, "Abrir archivo"); await pause(1500);
      cacheFile = `cache/terraqo_private_files/terraqo-evidence-${row.id}.png`;
      let cached = false;
      const cacheDeadline = Date.now() + 95000;
      while (Date.now() < cacheDeadline) {
        cached = shell(serial, `run-as com.terraqo.terraqo_mobile sh -c 'test -f ${cacheFile} && echo ready || echo pending'`).trim() === "ready";
        if (cached) break;
        await pause(700);
      }
      if (!cached) {
        const xml = await snapshot(serial);
        const messages = ["Vuelve a iniciar sesión", "La experiencia no está disponible", "La experiencia cambió", "No pudimos confirmar", "La respuesta no corresponde", "La respuesta supera", "El archivo no coincide", "El contenido no coincide", "La conexión se interrumpió", "Instala una aplicación compatible", "Tu sesión cambió", "No pudimos abrir la evidencia"].filter(message => xml.includes(message));
        console.log(`Native opening state: ${JSON.stringify(messages)}`);
        if (xml.includes("Evidencias")) capture(serial, `cv-experience-evidence-open-failure-${label}.png`);
      }
      assert.ok(cached, "The explicit download must create its own private cache file within the verification deadline.");
      assert.equal(shell(serial, `run-as com.terraqo.terraqo_mobile cat ${cacheFile} | base64`).replace(/\s/g, ""), bytes.toString("base64"));
      await pause(700);
      const foreground = shell(serial, "dumpsys window").split("\n").find(line => line.includes("mCurrentFocus")); assert.ok(foreground);
      if (!foreground.includes("com.terraqo.terraqo_mobile")) {
        assert.ok(foreground.includes("com.android") || foreground.includes("com.google"), "Expected native reader or chooser.");
        shell(serial, "input keyevent 4"); await pause(700);
        readerAttempted = false;
        console.log(`PASS explicit native reader dispatch ${serial}.`);
      } else {
        assert.ok((await snapshot(serial)).includes("Instala una aplicación compatible"));
        console.log(`LIMIT native opening ${serial}: missing reader feedback verified; private downloaded bytes exact.`);
      }
      phase = `${serial}: protected read/logout`;
      await prisma.terraqoProfessionalExperience.update({ where: { id: experienceId }, data: { verificationStatus: "APPROVED" } });
      // Re-entering performs fresh authorization/version reads. Protected records
      // still allow their owner to read; the button must not depend on editable.
      shell(serial, "input keyevent 4"); await pause(700); await tapLabel(serial, "Evidencias");
      await pause(700); const protectedXml = await snapshot(serial); assert.ok(protectedXml.includes(name));
      for (let attempt = 0; attempt < 4; attempt++) await scroll(serial);
      const selectionNode = [...(await snapshot(serial)).matchAll(/<node\b[^>]*>/g)].map(match => match[0]).find(node => node.includes('content-desc="Seleccionar archivo'));
      assert.ok(selectionNode); assert.ok(selectionNode.includes('enabled="false"'));
      assert.equal(await prisma.terraqoExperienceEvidence.count({ where: { experienceId } }), 1);
      shell(serial, "input keyevent 4"); await pause(500); shell(serial, "input keyevent 4"); await pause(500); shell(serial, "input keyevent 4"); await pause(500);
      await tapLabel(serial, "Cuenta"); await tapLabel(serial, "Cerrar sesión");
      for (let attempt = 0; attempt < 12; attempt++) { if ((await snapshot(serial)).includes("Ingresar a mi empresa")) break; await pause(700); }
      assert.ok((await snapshot(serial)).includes("Ingresar a mi empresa"));
      assert.equal(shell(serial, `run-as com.terraqo.terraqo_mobile sh -c 'test -e ${cacheFile} && echo retained || echo removed'`).trim(), "removed");
      const profile = await prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profileId } });
      assert.equal(profile.liveCvEnabled, false); assert.equal(profile.bankAccountNumber, null);
      console.log(`PASS native evidence ${serial}: cancel and review without mutation, one evidence/audit/quota, exact private bytes, updated list, protected owner read, disabled upload and logout cache removal.`);
    } finally {
      if (readerAttempted) {
        const focus = shell(serial, "dumpsys window").split("\n").find(line => line.includes("mCurrentFocus")) ?? "";
        if (focus.includes("com.google.android.apps.photos") || focus.includes("com.android.intentresolver") || focus.includes("com.android.documentsui")) {
          shell(serial, "input keyevent 4"); await pause(700);
        }
      }
      // Prefixes/owners below are generated exclusively in this invocation.
      if (experienceId) { const listing = await store.list({ prefix: `experience-evidence/${experienceId}/` }); for (const blob of listing.blobs) await store.delete(blob.key); }
      await prisma.activityLog.deleteMany({ where: { actorId: user.id, terraqoWorkspaceId: workspace.id, entityType: "ExperienceEvidence" } });
      await prisma.terraqoUsageBucket.deleteMany({ where: { ownerKey: `user:${user.id}` } });
      await prisma.verificationToken.deleteMany({ where: { identifier: { in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`] } } });
      await prisma.user.delete({ where: { id: user.id } });
      if (cacheFile) { assert.match(cacheFile, /^cache\/terraqo_private_files\/terraqo-evidence-[a-f0-9]{32}\.png$/); shell(serial, `run-as com.terraqo.terraqo_mobile rm -f ${cacheFile}`); }
      shell(serial, `rm -f /sdcard/Download/${name}`); shell(serial, "rm -f /sdcard/terraqo-native-test.xml"); shell(serial, "am force-stop com.terraqo.terraqo_mobile");
      console.log("CLEANUP: only this invocation's synthetic evidence, experience, profile, user, blobs, audits, quota, grants and picker file removed.");
    }
  }
}
main().catch(error => { console.error(`Native evidence phase: ${phase}`); console.error(error instanceof assert.AssertionError ? error.message : "Private diagnostics suppressed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
