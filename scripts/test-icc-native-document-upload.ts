import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { login, tapLabel, capture, shell, pause, snapshot } from "./native-android-controls";

let phase = "fixture";
async function tapPicker(serial: string, label: string) {
  const xml = await snapshot(serial);
  const node = [...xml.matchAll(/<node\b[^>]*>/g)].map(value => value[0]).find(value => value.includes(`text="${label}"`) || value.includes(`content-desc="${label}"`));
  if (!node) { console.log("PICKER STATE", xml); throw new Error("Picker control unavailable: " + label); }
  const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/); assert.ok(bounds);
  shell(serial, `input tap ${Math.round((+bounds[1]+ +bounds[3])/2)} ${Math.round((+bounds[2]+ +bounds[4])/2)}`); await pause(700);
}
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({where: {slug: "icc-topografia", active: true, deletedAt: null,
    companies: {some: {document: "20616116313", deletedAt: null}}}, select: {id: true}});
  const run = randomUUID(), password = randomBytes(24).toString("hex"), email = `native-upload-${run}@example.test`;
  const user = await prisma.user.create({data: {email, name: "Prueba documentos Android", role: "CUSTOMER", emailVerified: new Date(),
    passwordHash: await bcrypt.hash(password, 12), terraqoMemberships: {create: {workspaceId: workspace.id, role: "PROFESSIONAL", active: true}},
    terraqoProfessionalProfile: {create: {}}}, select: {id: true, terraqoProfessionalProfile: {select: {id: true}}}});
  const profileId = user.terraqoProfessionalProfile!.id;
  const base = "https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/";
  let bearer = "";
  const request = (path: string, method = "GET", body?: BodyInit) => fetch(`${base}${path}`, {method, body,
    headers: {...(bearer ? {authorization: `Bearer ${bearer}`} : {}), ...(typeof body === "string" ? {"content-type": "application/json"} : {})},
    redirect: "error", signal: AbortSignal.timeout(90000)});
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGMsAAAAASUVORK5CYII=", "base64");
  const remove = (id: string, version: string) => request(`documents/${id}?version=${encodeURIComponent(version)}`, "DELETE");
  try {
    phase = "login"; const response = await request("login", "POST", JSON.stringify({email, password}));
    assert.equal(response.status, 200); bearer = (await response.json()).data.token;
    const invalid = new FormData(); invalid.set("purpose","document"); invalid.set("documentType","OTHER");
    invalid.set("documentFile",new File(["<html>"],"disguised.png",{type:"image/png"}));
    assert.equal((await request("documents","POST",invalid)).status,422);
    assert.equal(await prisma.terraqoProfessionalDocument.count({where:{professionalProfileId:profileId}}),0);
    for (const [serial, label] of [["emulator-5554", "celular"], ["emulator-5556", "tablet"]] as const) {
      const renewed = await request("login", "POST", JSON.stringify({email, password}));
      assert.equal(renewed.status, 200); bearer = (await renewed.json()).data.token;
      const name = `Terraqo-native-${label}.png`;
      // Only the known test emulators receive a synthetic one-pixel PNG.
      assert.ok(["emulator-5554", "emulator-5556"].includes(serial));
      shell(serial, `printf '${png.toString("base64")}' | base64 -d > /sdcard/Download/${name}`);
      shell(serial, `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/${name}`);
      phase = `${serial}: native login`; await login(serial, email, password);
      await tapLabel(serial, "Abrir herramientas"); await tapLabel(serial, "Documentos profesionales");
      await tapLabel(serial, "Agregar documento");
      capture(serial, `cv-upload-empty-${label === "celular" ? "phone" : "tablet"}.png`);
      phase = `${serial}: picker cancel`; await tapLabel(serial, "Seleccionar archivo"); await pause(500);
      shell(serial, "input keyevent 4"); await pause(700);
      assert.equal(await prisma.terraqoProfessionalDocument.count({where: {professionalProfileId: profileId}}),0);
      phase = `${serial}: picker file`; await tapLabel(serial,"Seleccionar archivo"); await pause(800);
      let xml = await snapshot(serial);
      if (!xml.includes(`text="${name}"`)) {
        const rootLabel = xml.includes('content-desc="Show roots"') ? "Show roots" : "Mostrar raíces";
        await tapPicker(serial, rootLabel);
        xml = await snapshot(serial);
        await tapPicker(serial, xml.includes('text="Downloads"') ? "Downloads" : "Descargas");
      }
      await tapPicker(serial, name);
      assert.ok((await snapshot(serial)).includes(name));
      capture(serial, `cv-upload-review-${label === "celular" ? "phone" : "tablet"}.png`);
      phase = `${serial}: upload confirm`; await tapLabel(serial,"Enviar a revisión");
      for (let attempt=0;attempt<15;attempt++) { if ((await snapshot(serial)).includes("Documento recibido")) break; await pause(700); }
      assert.ok((await snapshot(serial)).includes("Documento recibido"));
      capture(serial, `cv-upload-success-${label === "celular" ? "phone" : "tablet"}.png`);
      const rows = await prisma.terraqoProfessionalDocument.findMany({where: {professionalProfileId: profileId,fileName:name},select:{id:true,workspaceId:true,type:true,size:true,reviewStatus:true}});
      assert.equal(rows.length,1); assert.equal(rows[0].workspaceId,workspace.id); assert.equal(rows[0].type,"CERTIFICATE");
      assert.equal(rows[0].size,png.length); assert.equal(rows[0].reviewStatus,"SUBMITTED");
      const id=rows[0].id;
      assert.equal(await prisma.activityLog.count({where:{actorId:user.id,entityId:id,action:"CREATED",entityType:"ProfessionalDocument"}}),1);
      await tapLabel(serial,"Volver al expediente");
      const protectedRow = await prisma.terraqoProfessionalDocument.findUniqueOrThrow({where: {id}, select: {uploadedAt: true}});
      assert.equal((await remove(id, protectedRow.uploadedAt.toISOString())).status, 409, "Pending review cannot be removed.");
      // Only our synthetic upload is marked rejected to exercise owner removal.
      await prisma.terraqoProfessionalDocument.update({where: {id}, data: {reviewStatus: "REJECTED", ...(label === "celular" ? {workspaceId: null} : {})}});
      phase = `${serial}: HTTP scope`; const listed = await request("resources/professionalDocuments"); assert.equal(listed.status, 200);
      const record = (await listed.json()).data.records.find((item: {id: string}) => item.id === id);
      assert.ok(record); assert.equal(record.canDelete, true); assert.equal(record.fields.kind, "professionalDocument");
      assert.ok(!JSON.stringify(record).includes("storageKey"));
      assert.equal((await remove(id, "2025-01-01T00:00:00Z")).status, 409);
      const download = await request(`documents/${id}`); assert.equal(download.status, 200);
      assert.equal(download.headers.get("cache-control")?.replace(/\s/g, ""), "private,no-store,max-age=0");
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
      assert.equal((await fetch(`${base}documents/${id}`, {redirect: "error"})).status, 401);
      phase = `${serial}: document`; await tapLabel(serial, "Actualizar"); await pause(1000); await tapLabel(serial, name);
      capture(serial, `cv-upload-document-${label === "celular" ? "phone" : "tablet"}.png`);
      phase = `${serial}: native open`; await tapLabel(serial, "Abrir documento"); await pause(1500);
      const foreground = shell(serial, "dumpsys window windows").split("\n").find(line => line.includes("mCurrentFocus")) || "";
      if (!foreground.includes("com.terraqo.terraqo_mobile")) {
        shell(serial, "input keyevent 4"); await pause(600);
        console.log(`PASS native external image handler ${serial}.`);
      } else {
        assert.ok((await snapshot(serial)).includes("Instala una aplicación compatible"), "Opening requires a reader or clear missing-reader feedback.");
        console.log(`LIMIT native image opening ${serial}: compatible reader not installed; explicit feedback verified.`);
      }
      phase = `${serial}: confirmed removal`; await tapLabel(serial, "Eliminar archivo");
      await tapLabel(serial, "Conservar"); assert.equal(await prisma.terraqoProfessionalDocument.count({where: {id}}), 1);
      await tapLabel(serial, "Eliminar archivo");
      capture(serial, `cv-upload-document-confirm-${label === "celular" ? "phone" : "tablet"}.png`);
      await tapLabel(serial, "Eliminar");
      for (let attempt = 0; attempt < 12; attempt++) {
        if (!await prisma.terraqoProfessionalDocument.count({where: {id}})) break; await pause(700);
      }
      assert.equal(await prisma.terraqoProfessionalDocument.count({where: {id}}), 0);
      for (let attempt=0; attempt<15; attempt++) {
        const completed=await prisma.activityLog.findFirst({where:{actorId:user.id,entityId:id,entityType:"ProfessionalDocument",action:"DELETED"},select:{metadata:true}});
        if ((completed?.metadata as {storageCleanupState?:string}|null)?.storageCleanupState === "COMPLETE") break;
        await pause(800);
      }
      const audit = await prisma.activityLog.findMany({where: {actorId: user.id, entityId: id, entityType: "ProfessionalDocument", action:"DELETED"}, select: {metadata: true}});
      assert.equal(audit.length, 1); assert.equal((audit[0].metadata as {storageCleanupState: string}).storageCleanupState, "COMPLETE");
      assert.equal((await request(`documents/${id}`)).status, 404);
      shell(serial, "input keyevent 4"); await pause(500); shell(serial, "input keyevent 4"); await pause(500);
      await tapLabel(serial, "Cuenta"); await tapLabel(serial, "Cerrar sesión");
      for (let attempt=0; attempt<10; attempt++) {if ((await snapshot(serial)).includes("Ingresar a mi empresa")) break; await pause(700);}
      assert.ok((await snapshot(serial)).includes("Ingresar a mi empresa"));
      shell(serial, `rm -f /sdcard/Download/${name}`);
      console.log(`PASS native document upload ${serial}: reviewed selection, cancellation, submitted state, one create audit; private scope, cancellation, confirmed removal, one audit, physical cleanup and logout.`);
    }
    const renewed = await request("login", "POST", JSON.stringify({email, password}));
    assert.equal(renewed.status, 200); bearer = (await renewed.json()).data.token;
    phase = "role revocation";
    await prisma.terraqoWorkspaceMember.updateMany({where: {workspaceId: workspace.id, userId: user.id}, data: {role: "VIEWER"}});
    assert.ok([401,403].includes((await request("resources/professionalDocuments")).status));
    assert.ok([401,403].includes((await request("documents", "POST", new FormData())).status));
    console.log("PASS deployed professional documents: protected review, personal/current workspace scope, authenticated exact bytes, stale version and revocation.");
  } finally {
    // Restore only our membership to clean up any uploaded fixture after failure.
    await prisma.terraqoWorkspaceMember.updateMany({where: {workspaceId: workspace.id, userId: user.id}, data: {role: "PROFESSIONAL"}});
    const remaining = await prisma.terraqoProfessionalDocument.findMany({where: {professionalProfileId: profileId}, select: {id: true, uploadedAt: true}});
    if (remaining.length) {
      const renewed = await request("login", "POST", JSON.stringify({email, password}));
      assert.equal(renewed.status, 200); bearer = (await renewed.json()).data.token;
    }
    for (const document of remaining) {
      await prisma.terraqoProfessionalDocument.update({where: {id: document.id}, data: {reviewStatus: "REJECTED"}});
      const deletion = await remove(document.id, document.uploadedAt.toISOString()); assert.equal(deletion.status, 200);
      assert.equal((await deletion.json()).data.storageCleanupPending, false, "Fixture blob cleanup must complete.");
    }
    await prisma.activityLog.deleteMany({where: {actorId: user.id, terraqoWorkspaceId: workspace.id, entityType: "ProfessionalDocument"}});
    await prisma.terraqoUsageBucket.deleteMany({where: {ownerKey: `user:${user.id}`}});
    await prisma.verificationToken.deleteMany({where: {identifier: {in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`]}}});
    await prisma.user.delete({where: {id: user.id}});
    for (const [serial,label] of [["emulator-5554","celular"],["emulator-5556","tablet"]]) {
      shell(serial, `rm -f /sdcard/terraqo-native-test.xml /sdcard/Download/Terraqo-native-${label}.png`);
    }
    console.log("CLEANUP: own synthetic files/blobs, profile, quota, audit, user and session grants removed.");
  }
}
main().catch(error => {console.error(`Document phase: ${phase}`); console.error(error instanceof assert.AssertionError ? error.message : "Private diagnostics suppressed."); process.exitCode=1;}).finally(()=>prisma.$disconnect());
