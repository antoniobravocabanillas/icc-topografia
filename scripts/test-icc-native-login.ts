import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

const adb = join(process.env.LOCALAPPDATA!, "Android/Sdk/platform-tools/adb.exe");
const adbEnvironment = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "USERPROFILE", "LOCALAPPDATA", "TEMP", "TMP"].filter(key => process.env[key]).map(key => [key, process.env[key]!])) as NodeJS.ProcessEnv;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let stage = "initialization";
const shell = (serial: string, command: string) => execFileSync(adb, ["-s", serial, "shell"], {
  // Passwords travel through stdin, never process arguments, logs or files.
  input: `${command}\nexit\n`, encoding: "utf8", env: adbEnvironment, timeout: 30000, stdio: ["pipe", "pipe", "pipe"],
});
async function snapshot(serial: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = shell(serial, "uiautomator dump /sdcard/terraqo-native-test.xml");
      if (result.includes("dumped to")) {
        const xml = shell(serial, "cat /sdcard/terraqo-native-test.xml");
        if (xml.includes("<hierarchy")) return xml;
      }
    } catch { /* Android's accessibility root may be unavailable during launch. */ }
    await pause(600);
  }
  throw new Error("Android accessibility root unavailable.");
}
function nodes(xml: string) { return [...xml.matchAll(/<node\b[^>]*>/g)].map(match => match[0]); }
function center(node: string) {
  const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  assert.ok(bounds); return `${Math.round((+bounds[1] + +bounds[3]) / 2)} ${Math.round((+bounds[2] + +bounds[4]) / 2)}`;
}
async function tapLabel(serial: string, label: string, exact = false) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const node = nodes(await snapshot(serial)).find(node => node.includes(`content-desc="${label}${exact ? '"' : ''}`) && node.includes('clickable="true"'));
    if (node) { shell(serial, `input tap ${center(node)}`); await pause(500); return; }
    shell(serial, "input swipe 540 1800 540 700 400"); await pause(500);
  }
  throw new Error(`Native control unavailable: ${label}`);
}
async function fill(serial: string, index: number, value: string, observedInputs?: string[]) {
  assert.match(value, /^[a-zA-Z0-9@._-]+$/);
  const inputs = observedInputs ?? nodes(await snapshot(serial)).filter(node => node.includes('class="android.widget.EditText"'));
  assert.ok(inputs[index], "Native input not available.");
  shell(serial, `input tap ${center(inputs[index])}`); await pause(600);
  shell(serial, `input text ${value}`); shell(serial, "input keyevent 4"); await pause(300);
}
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313", "Explicit ICC test scope is required.");
  const workspace = await prisma.terraqoWorkspace.findFirst({ where: { slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  assert.ok(workspace);
  const run = randomUUID(), email = `native-${run}@example.test`, password = randomBytes(24).toString("hex");
  const user = await prisma.user.create({ data: { email, name: "Prueba Android", role: "CUSTOMER", emailVerified: new Date(),
    passwordHash: await bcrypt.hash(password, 12), terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
    terraqoProfessionalProfile: { create: {} } }, select: { id: true } });
  const call = (action: string, token?: string, body?: unknown, method?: string) => fetch(`https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/${action}`, {
    method: method ?? (body ? "POST" : "GET"), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: "error", signal: AbortSignal.timeout(90000),
  });
  const reviewDirectory = join(process.env.USERPROFILE!, "Documents/ICC TOPOGRAFIA/terraqo_mobile/review");
  const capture = (serial: string) => {
    assert.ok(existsSync(reviewDirectory));
    // Capture only the synthetic profile form, never login or customer records.
    writeFileSync(join(reviewDirectory, serial === "emulator-5554" ? "profile-phone.png" : "profile-tablet.png"),
      execFileSync(adb, ["-s", serial, "exec-out", "screencap", "-p"], { env: adbEnvironment, timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }));
  };
  try {
    for (const serial of ["emulator-5554", "emulator-5556"]) {
      stage = `${serial}: launching`;
      shell(serial, "am force-stop com.terraqo.terraqo_mobile");
      shell(serial, "am start -n com.terraqo.terraqo_mobile/.MainActivity"); await pause(1500);
      let loginReady = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        if ((await snapshot(serial)).includes("Ingresar a mi empresa")) { loginReady = true; break; }
        await pause(700);
      }
      assert.ok(loginReady, "Test requires an empty login screen.");
      const loginInputs = nodes(await snapshot(serial)).filter(node => node.includes('class="android.widget.EditText"'));
      assert.equal(loginInputs.length, 3);
      // Keyboard dismissal restores these observed bounds. Avoid requesting an
      // accessibility dump while Android autofill is updating after each field.
      stage = `${serial}: filling workspace`; await fill(serial, 0, "icc-topografia", loginInputs);
      stage = `${serial}: filling email`; await fill(serial, 1, email, loginInputs);
      stage = `${serial}: filling password`; await fill(serial, 2, password, loginInputs);
      stage = `${serial}: submitting login`;
      await tapLabel(serial, "Ingresar a mi empresa");
      let ready = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        await pause(1000); if ((await snapshot(serial)).includes("Abrir herramientas")) { ready = true; break; }
      }
      assert.ok(ready, "Native password login did not reach the workspace.");
      assert.ok(!(await snapshot(serial)).includes("VISTA PREVIA"));
      stage = `${serial}: opening notes`;
      await tapLabel(serial, "Abrir herramientas"); await tapLabel(serial, "Mis notas"); await tapLabel(serial, "Nuevo registro");
      const title = `native-${serial}-${run}`;
      stage = `${serial}: saving note`;
      await fill(serial, 0, title); await fill(serial, 1, "Native-validation-content"); await tapLabel(serial, "Guardar");
      for (let attempt = 0; attempt < 8; attempt++) {
        if (await prisma.terraqoPrivateNote.count({ where: { workspaceId: workspace.id, userId: user.id, title, body: "Native-validation-content" } })) break;
        await pause(1000);
      }
      assert.equal(await prisma.terraqoPrivateNote.count({ where: { workspaceId: workspace.id, userId: user.id, title } }), 1);
      shell(serial, "input keyevent 4"); await pause(500);
      stage = `${serial}: editing professional profile`;
      await tapLabel(serial, "Mi perfil profesional");
      await tapLabel(serial, serial === "emulator-5554" ? "Mi perfil profesional" : "Topografo-native");
      if (serial === "emulator-5554") {
        await fill(serial, 0, "Topografo-native"); await fill(serial, 1, "Perfil-temporal");
        capture(serial);
        await tapLabel(serial, "Guardar");
        for (let attempt = 0; attempt < 8; attempt++) {
          const profile = await prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { headline: true, liveCvEnabled: true } });
          if (profile.headline === "Topografo-native") { assert.equal(profile.liveCvEnabled, false); break; }
          await pause(1000);
        }
        assert.equal((await prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { headline: true } })).headline, "Topografo-native");
      } else {
        assert.ok((await snapshot(serial)).includes("Topografo-native"), "The second device must read the saved professional profile.");
        capture(serial);
        shell(serial, "input keyevent 4"); await pause(500);
      }
      shell(serial, "input keyevent 4"); await pause(500);
      stage = `${serial}: preparing private test file`;
      const fileLogin = await call("login", undefined, { email, password }); assert.equal(fileLogin.status, 200);
      const fileToken = (await fileLogin.json()).data.token as string;
      let fileId: string;
      try {
        const form = new FormData(); form.set("title", "Documento de prueba"); form.set("visibility", "PRIVATE"); form.set("category", "OTHER");
        form.set("file", new Blob(["Prueba temporal Android"], { type: "text/plain" }), "prueba-android.txt");
        const uploaded = await call("files", fileToken, form); assert.equal(uploaded.status, 201); fileId = (await uploaded.json()).data.id;
      } finally { assert.equal((await call("logout", fileToken, undefined, "POST")).status, 200); }
      stage = `${serial}: deleting private test file`;
      // Returning from the profile restores the hub's previous scroll position.
      // Files can be above it; reset the hub before searching its native control.
      for (let step = 0; step < 3; step++) { shell(serial, "input swipe 540 400 540 1300 350"); await pause(200); }
      await tapLabel(serial, "Archivos"); stage = `${serial}: opening private test file`;
      await tapLabel(serial, "Documento de prueba"); stage = `${serial}: canceling file deletion`;
      await tapLabel(serial, "Eliminar archivo"); await tapLabel(serial, "Conservar");
      assert.equal(await prisma.terraqoWorkspaceFile.count({ where: { id: fileId, userId: user.id } }), 1);
      stage = `${serial}: confirming file deletion`;
      await tapLabel(serial, "Eliminar archivo"); await tapLabel(serial, "Eliminar", true);
      for (let attempt = 0; attempt < 8; attempt++) {
        if (!await prisma.terraqoWorkspaceFile.count({ where: { id: fileId, userId: user.id } })) break;
        await pause(1000);
      }
      assert.equal(await prisma.terraqoWorkspaceFile.count({ where: { id: fileId, userId: user.id } }), 0);
      shell(serial, "input keyevent 4"); await pause(500); shell(serial, "input keyevent 4"); await pause(500);
      stage = `${serial}: logging out`;
      await tapLabel(serial, "Cuenta"); await tapLabel(serial, "Cerrar sesión");
      for (let attempt = 0; attempt < 10; attempt++) {
        await pause(600); if ((await snapshot(serial)).includes("Ingresar a mi empresa")) break;
      }
      assert.ok((await snapshot(serial)).includes("Ingresar a mi empresa"));
      console.log(`PASS native ${serial}: real password login, private note persisted once, own profile edit/read, file deletion canceled then confirmed, logout returned to login; preview inactive.`);
    }
    assert.equal(await prisma.verificationToken.count({ where: { identifier: `portal-session:${workspace.id}:${user.id}` } }), 0, "Native logout must revoke every tested device session.");
  } finally {
    const leftovers = await prisma.terraqoWorkspaceFile.findMany({ where: { workspaceId: workspace.id, userId: user.id }, select: { id: true } });
    if (leftovers.length) {
      const login = await call("login", undefined, { email, password }); assert.equal(login.status, 200);
      const token = (await login.json()).data.token as string;
      try { for (const file of leftovers) assert.equal((await call(`files/${file.id}`, token, undefined, "DELETE")).status, 200); }
      finally { assert.equal((await call("logout", token, undefined, "POST")).status, 200); }
    }
    await prisma.verificationToken.deleteMany({ where: { identifier: { in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`] } } });
    await prisma.user.delete({ where: { id: user.id } });
    for (const serial of ["emulator-5554", "emulator-5556"]) shell(serial, "rm -f /sdcard/terraqo-native-test.xml");
    console.log("CLEANUP: native fixture account, memberships, grants and notes removed.");
  }
}
main().catch((error: unknown) => { console.error(`Native stage: ${stage}`);
  const diagnostic = error as { code?: string; name?: string; status?: number; signal?: string; message?: string };
  const safeReason = diagnostic.message === "Android accessibility root unavailable." ? "accessibility_unavailable" : diagnostic.code ?? "control_unavailable";
  console.error(error instanceof assert.AssertionError ? error.message : `Native validation failed (${safeReason}; ${diagnostic.name}; exit=${diagnostic.status}; signal=${diagnostic.signal}); credential diagnostics suppressed.`);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
