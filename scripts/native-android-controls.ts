import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, writeFileSync } from "node:fs";

const adb = join(process.env.LOCALAPPDATA!, "Android/Sdk/platform-tools/adb.exe");
// Native helper processes must not inherit server/database credentials.
const environment = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "USERPROFILE", "LOCALAPPDATA", "TEMP", "TMP"].filter(key => process.env[key]).map(key => [key, process.env[key]!])) as NodeJS.ProcessEnv;
export const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const shell = (serial: string, command: string) => execFileSync(adb, ["-s", serial, "shell"], {
  input: `${command}\nexit\n`, encoding: "utf8", env: environment, timeout: 30000, stdio: ["pipe", "pipe", "pipe"],
});
export async function snapshot(serial: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = shell(serial, "uiautomator dump /sdcard/terraqo-native-test.xml");
      if (result.includes("dumped to")) {
        const xml = shell(serial, "cat /sdcard/terraqo-native-test.xml");
        if (xml.includes("<hierarchy")) return xml;
      }
    } catch { /* Accessibility can be unavailable briefly during launch. */ }
    await pause(600);
  }
  throw new Error("Android accessibility root unavailable.");
}
const nodes = (xml: string) => [...xml.matchAll(/<node\b[^>]*>/g)].map(match => match[0]);
function center(node: string) {
  const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  assert.ok(bounds); return `${Math.round((+bounds[1] + +bounds[3]) / 2)} ${Math.round((+bounds[2] + +bounds[4]) / 2)}`;
}
async function hideShownKeyboard(serial: string) {
  // Back also dismisses the current route when Android has no visible IME.
  // Check its window immediately before sending Back, including after input.
  const imeWindow=shell(serial,"dumpsys window windows").split(/(?=  Window #\d+ Window\{)/)
    .find(block=>/^  Window #\d+ Window\{[^\n]+ InputMethod\}:/.test(block));
  if (imeWindow?.includes("isVisible=true") && imeWindow.includes("mHasSurface=true")) {
    shell(serial,"input keyevent 4");await pause(400);
  }
}
export async function scroll(serial: string, down = false) {
  await hideShownKeyboard(serial);
  const dimensions = [...shell(serial, "wm size").matchAll(/(\d+)x(\d+)/g)].at(-1); assert.ok(dimensions);
  const x = Math.round(+dimensions[1] / 2), top = Math.round(+dimensions[2] * .25), bottom = Math.round(+dimensions[2] * .8);
  shell(serial, `input swipe ${x} ${down ? top : bottom} ${x} ${down ? bottom : top} 350`); await pause(300);
}
export async function tapLabel(serial: string, label: string) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const node = nodes(await snapshot(serial)).find(node =>
      (node.includes(`content-desc="${label}`) || node.includes(`hint="${label}"`)) && node.includes('clickable="true"'));
    if (node) { shell(serial, `input tap ${center(node)}`); await pause(500); return; }
    await scroll(serial);
  }
  throw new Error(`Native control unavailable: ${label}`);
}
async function fillNode(serial: string, node: string, value: string) {
  assert.match(value, /^[a-zA-Z0-9@._-]+$/);
  shell(serial, `input tap ${center(node)}`); await pause(600);
  // Tap placement can put the caret inside existing text. Append explicitly.
  shell(serial, "input keyevent 123");
  // Credentials enter via stdin, never a process argument, screenshot or log.
  shell(serial, `input text ${value}`); await hideShownKeyboard(serial); await pause(300);
}
export async function fillLabel(serial: string, label: string, value: string) {
  for (let attempt = 0; attempt < 9; attempt++) {
    const node = nodes(await snapshot(serial)).find(node => node.includes('class="android.widget.EditText"') &&
      (node.includes(`content-desc="${label}`) || node.includes(`text="${label}`) || node.includes(`hint="${label}"`)));
    if (node) { await fillNode(serial, node, value); return; }
    await scroll(serial);
  }
  throw new Error(`Native input unavailable: ${label}`);
}
export async function fillLastLabel(serial: string, label: string, value: string) {
  for (let attempt=0;attempt<9;attempt++) {
    const node=nodes(await snapshot(serial)).reverse().find(node=>node.includes('class="android.widget.EditText"') &&
      (node.includes(`content-desc="${label}`) || node.includes(`text="${label}`) || node.includes(`hint="${label}"`)));
    if(node){await fillNode(serial,node,value);return;}
    await scroll(serial);
  }
  throw new Error(`Native input unavailable: ${label}`);
}
export async function login(serial: string, email: string, password: string) {
  shell(serial, "am force-stop com.terraqo.terraqo_mobile"); shell(serial, "am start -n com.terraqo.terraqo_mobile/.MainActivity");
  let ready = false;
  for (let attempt = 0; attempt < 10; attempt++) { await pause(700); if ((await snapshot(serial)).includes("Ingresar a mi empresa")) { ready = true; break; } }
  assert.ok(ready, "Test requires an empty login screen.");
  const fields = nodes(await snapshot(serial)).filter(node => node.includes('class="android.widget.EditText"')); assert.equal(fields.length, 3);
  for (const [index, value] of ["icc-topografia", email, password].entries()) await fillNode(serial, fields[index], value);
  await tapLabel(serial, "Ingresar a mi empresa"); ready = false;
  for (let attempt = 0; attempt < 12; attempt++) { await pause(1000); if ((await snapshot(serial)).includes("Abrir herramientas")) { ready = true; break; } }
  assert.ok(ready, "Native login must reach the workspace."); assert.ok(!(await snapshot(serial)).includes("VISTA PREVIA"));
}
export function capture(serial: string, fileName: string) {
  assert.match(fileName, /^(?:cv|task|project|workspace|contact|company|opportunity|quote)-[a-z-]+\.png$/);
  const directory = join(process.env.USERPROFILE!, "Documents/ICC TOPOGRAFIA/terraqo_mobile/review"); assert.ok(existsSync(directory));
  writeFileSync(join(directory, fileName), execFileSync(adb, ["-s", serial, "exec-out", "screencap", "-p"], { env: environment, timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }));
}
