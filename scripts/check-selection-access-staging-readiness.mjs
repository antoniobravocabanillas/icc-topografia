import { readFile } from "node:fs/promises";
import { selectionAccessStagingReadiness } from "./lib/selection-access-staging-readiness.mjs";
const file = process.argv[2];
if (!file) throw new Error("Provide the saved staging identity and catalog audit JSON.");
const result = selectionAccessStagingReadiness(JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, "")));
console.log(JSON.stringify(result, null, 2));
if (!result.schemaReady) process.exitCode = 2;
