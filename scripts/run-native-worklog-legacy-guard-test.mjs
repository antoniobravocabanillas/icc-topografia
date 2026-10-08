import { build } from "esbuild";
import { mkdir, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "tmp/native-worklog-legacy-guard-test.cjs");
await mkdir(dirname(output), { recursive: true });
try {
  await build({ absWorkingDir: root, entryPoints: ["scripts/test-native-worklog-legacy-guard.ts"], outfile: output,
    bundle: true, platform: "node", format: "cjs", packages: "external", logLevel: "silent",
    plugins: [{ name: "controlled-guard-test-ports", setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "guard-test" }));
      builder.onResolve({ filter: /^@\/auth$/ }, () => ({ path: "auth", namespace: "guard-test" }));
      builder.onLoad({ filter: /.*/, namespace: "guard-test" }, args => ({ contents: args.path === "auth"
        ? 'export async function auth(){throw new Error("AUTH_MUST_NOT_RUN_IN_GUARD_TEST");}' : "export {};", loader: "js" }));
    } }] });
  const test = spawnSync(process.execPath, [output], { cwd: root, stdio: "inherit", timeout: 30000 });
  process.exitCode = test.status ?? 1;
} finally { await unlink(output).catch(() => undefined); }
