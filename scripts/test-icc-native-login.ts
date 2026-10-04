import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
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
async function tapLabel(serial: string, label: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const node = nodes(await snapshot(serial)).find(node => node.includes(`content-desc="${label}`) && node.includes('clickable="true"'));
    if (node) { shell(serial, `input tap ${center(node)}`); await pause(500); return; }
    shell(serial, "input swipe 540 1800 540 700 400"); await pause(500);
  }
  throw new Error(`Native control unavailable: ${label}`);
}
async function fill(serial: string, index: number, value: string) {
  assert.match(value, /^[a-zA-Z0-9@._-]+$/);
  const inputs = nodes(await snapshot(serial)).filter(node => node.includes('class="android.widget.EditText"'));
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
  try {
    for (const serial of ["emulator-5554", "emulator-5556"]) {
      stage = `${serial}: launching`;
      shell(serial, "am force-stop com.terraqo.terraqo_mobile");
      shell(serial, "am start -n com.terraqo.terraqo_mobile/.MainActivity"); await pause(1500);
      assert.ok((await snapshot(serial)).includes("Ingresar a mi empresa"), "Test requires an empty login screen.");
      stage = `${serial}: filling workspace`; await fill(serial, 0, "icc-topografia");
      stage = `${serial}: filling email`; await fill(serial, 1, email);
      stage = `${serial}: filling password`; await fill(serial, 2, password);
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
        await tapLabel(serial, "Guardar");
        for (let attempt = 0; attempt < 8; attempt++) {
          const profile = await prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { headline: true, liveCvEnabled: true } });
          if (profile.headline === "Topografo-native") { assert.equal(profile.liveCvEnabled, false); break; }
          await pause(1000);
        }
        assert.equal((await prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { headline: true } })).headline, "Topografo-native");
      } else {
        assert.ok((await snapshot(serial)).includes("Topografo-native"), "The second device must read the saved professional profile.");
        shell(serial, "input keyevent 4"); await pause(500);
      }
      shell(serial, "input keyevent 4"); await pause(500); shell(serial, "input keyevent 4"); await pause(500);
      stage = `${serial}: logging out`;
      await tapLabel(serial, "Cuenta"); await tapLabel(serial, "Cerrar sesión");
      for (let attempt = 0; attempt < 10; attempt++) {
        await pause(600); if ((await snapshot(serial)).includes("Ingresar a mi empresa")) break;
      }
      assert.ok((await snapshot(serial)).includes("Ingresar a mi empresa"));
      console.log(`PASS native ${serial}: real password login, private note persisted once, own professional profile edit/read, logout returned to login; preview inactive.`);
    }
    assert.equal(await prisma.verificationToken.count({ where: { identifier: `portal-session:${workspace.id}:${user.id}` } }), 0, "Native logout must revoke every tested device session.");
  } finally {
    await prisma.verificationToken.deleteMany({ where: { identifier: { in: [`portal-session:${workspace.id}:${user.id}`, `portal-login-attempt:${workspace.id}:${user.id}`] } } });
    await prisma.user.delete({ where: { id: user.id } });
    for (const serial of ["emulator-5554", "emulator-5556"]) shell(serial, "rm -f /sdcard/terraqo-native-test.xml");
    console.log("CLEANUP: native fixture account, memberships, grants and notes removed.");
  }
}
main().catch((error: unknown) => { console.error(`Native stage: ${stage}`); console.error(error instanceof assert.AssertionError ? error.message : `Native validation failed (${(error as { code?: string }).code ?? "control unavailable"}); credential diagnostics suppressed.`); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
