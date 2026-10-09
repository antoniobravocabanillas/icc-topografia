import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = await mkdtemp(join(root, "tmp/native-executor-own-"));
try {
  const output = join(directory, "test.cjs");
  const ports = { "native-worklog-accounting-review": "quarantineNativeAccountingReviewInTransaction",
    "native-worklog-schema-gate": "assertNativeWorklogSchemaInTransaction",
    "native-worklog-selected-accounting": "settleSelectedNativeAccountingInTransaction",
    "native-worklog-accounting-acknowledgement": "reconcileNativeAccountingAcknowledgementInTransaction" };
  await build({ absWorkingDir: root, entryPoints: ["scripts/test-native-worklog-accounting-executor.ts"],
    outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external", logLevel: "silent",
    plugins: [{ name: "controlled-executor-ports", setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "marker", namespace: "executor-test" }));
      builder.onResolve({ filter: /^\.\/native-worklog-(accounting-review|selected-accounting|accounting-acknowledgement|schema-gate)$/ }, args =>
        ({ path: args.path.slice(2), namespace: "executor-test" }));
      builder.onLoad({ filter: /.*/, namespace: "executor-test" }, args => {
        if (args.path === "marker") return { contents: "export {};", loader: "js" };
        const name = ports[args.path];
        const phase = args.path.endsWith("schema-gate") ? "schema" : args.path.endsWith("review") ? "review" : args.path.endsWith("acknowledgement") ? "ack" : "settle";
        return { contents: `export async function ${name}(){return globalThis.__nativeExecutorPorts.${phase}();}`, loader: "js" };
      });
    } }] });
  const test = spawnSync(process.execPath, [output], { cwd: root, stdio: "inherit", timeout: 30000 });
  process.exitCode = test.status ?? 1;
} finally {
  if (dirname(resolve(directory)) !== resolve(root, "tmp") || !directory.includes("native-executor-own-")) throw new Error("Own cleanup boundary rejected");
  await rm(directory, { recursive: true });
}
