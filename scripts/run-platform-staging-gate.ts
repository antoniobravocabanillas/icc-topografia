import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stagingGateScript, stagingRunnerEnvironment } from "./lib/platform-staging-runner";
import { isolateStagingDotenv } from "./lib/staging-dotenv-isolation";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.platform-staging.local");
let restore: (() => void) | undefined;
function restoreEnvironment() {
  try { restore?.(); restore = undefined; return true; }
  catch { console.error("El entorno requiere recuperacion manual: conserva los archivos .platform-gate-hold.local y no inicies otro gate."); process.exitCode = 1; return false; }
}
try {
  if (process.argv.length > 3) throw new Error("Este runner no acepta argumentos adicionales.");
  const script = stagingGateScript(process.argv[2] || "preflight");
  if (statSync(envPath).size > 64 * 1024) throw new Error("Archivo de staging demasiado grande.");
  const environment = stagingRunnerEnvironment(readFileSync(envPath, "utf8"), process.env);
  restore = isolateStagingDotenv(root);
  // The reviewed runner is the only executable destination. Secrets travel in
  // its environment, never command arguments. No shell, deploy or DDL command.
  const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", resolve(root, "scripts", script)], {
    cwd: root, env: environment, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  // Child errors can include connection details. Do not relay raw output.
  // Operators receive the gate/exit status; private diagnostics stay in memory.
  child.stdout.resume();
  child.stderr.resume();
  child.on("error", () => { console.error("No se pudo iniciar el gate de staging."); process.exitCode = 1; });
  const terminate = () => child.kill();
  process.once("SIGINT", terminate);
  process.once("SIGTERM", terminate);
  child.on("close", (code) => {
    process.off("SIGINT", terminate);
    process.off("SIGTERM", terminate);
    const restored = restoreEnvironment();
    const passed = code === 0 && restored;
    console.log(`Staging ${process.argv[2] || "preflight"}: ${passed ? "PASS" : "FAIL"} (exit=${code ?? "interrupted"}; restored=${restored}).`);
    process.exitCode = passed ? 0 : 1;
  });
} catch (error) {
  const absent = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
  console.error(absent
    ? "Falta .env.platform-staging.local. Usa la plantilla de staging y sus credenciales exclusivas."
    : "El preflight local rechazo la configuracion. Revisa la plantilla, destino y secretos exclusivos de staging; no se inicio ningun proceso de prueba.");
  process.exitCode = 1;
  restoreEnvironment();
}
