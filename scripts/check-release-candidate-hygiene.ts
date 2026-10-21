import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const trackedFiles = execFileSync("git", ["ls-files"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
})
  .split(/\r?\n/)
  .filter(Boolean)
  .map((path) => path.replaceAll("\\", "/"));

const forbiddenTracked = trackedFiles.filter(
  (path) =>
    path === "deno.lock" ||
    path.startsWith(".playwright-cli/") ||
    path.startsWith("output/") ||
    path.startsWith("tmp/") ||
    path.includes("/__pycache__/") ||
    path.endsWith(".pyc"),
);
assert.deepEqual(
  forbiddenTracked,
  [],
  `El candidato contiene artefactos locales rastreados: ${forbiddenTracked.join(", ")}`,
);

const forbiddenEnvFiles = trackedFiles.filter(
  (path) =>
    (path === ".env" || path.startsWith(".env.")) &&
    path !== ".env.example",
);
assert.deepEqual(
  forbiddenEnvFiles,
  [],
  `El candidato contiene archivos de entorno privados: ${forbiddenEnvFiles.join(", ")}`,
);

const gitignore = readFileSync(resolve(root, ".gitignore"), "utf8");
for (const pattern of [
  ".playwright-cli/",
  "output/",
  "tmp/",
  "**/__pycache__/",
  "*.pyc",
  "deno.lock",
]) {
  assert.ok(
    gitignore.split(/\r?\n/).includes(pattern),
    `.gitignore debe excluir ${pattern} del candidato.`,
  );
}

const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
const envValues = new Map<string, string>();
for (const line of envExample.split(/\r?\n/)) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
  if (!match) continue;
  envValues.set(match[1], match[2].replace(/^['"]|['"]$/g, ""));
}

const emptySecrets = [
  "AUTH_GOOGLE_SECRET",
  "AUTH_APPLE_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  "CULQI_SECRET_KEY",
  "BILLING_RECONCILE_SECRET",
  "RESEND_API_KEY",
  "TERRAQO_DOCUMENT_AI_TOKEN",
  "CV_IMPORT_DISPATCH_SECRET",
  "TERRAQO_ADMIN_PASSWORD",
  "ICC_ADMIN_PASSWORD",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "EVIDENCE_ANALYSIS_DISPATCH_SECRET",
] as const;

for (const name of emptySecrets) {
  assert.ok(envValues.has(name), `.env.example debe declarar ${name}.`);
  assert.equal(envValues.get(name), "", `.env.example no debe incluir un valor para ${name}.`);
}

const authSecret = envValues.get("AUTH_SECRET") ?? "";
assert.match(
  authSecret,
  /(?:replace|change|example)/i,
  "AUTH_SECRET debe ser un marcador inequívoco, nunca una credencial utilizable.",
);

console.log(
  `Release candidate hygiene: OK (${trackedFiles.length} archivos rastreados; sin artefactos locales ni secretos en la plantilla).`,
);
