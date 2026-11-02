import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const source = process.argv[2];
assert.ok(source, "Provide a verified staging migration readback.");
const rows = JSON.parse(await readFile(source, "utf8"));
const folder = await mkdtemp(path.join(os.tmpdir(), "terraqo-ledger-test-"));
const file = path.join(folder, "ledger.json");
try {
  for (const [label, ledger, expected] of [
    ["baseline", rows, 0],
    ["SQL drift", rows.map((r, i) => i ? r : { ...r, checksum: "0".repeat(64) }), 1],
    ["missing migration", rows.slice(1), 1],
    ["duplicate migration", [...rows, rows[0]], 1],
    ["unknown migration", [...rows, { migration_name: "../outside", checksum: "0".repeat(64) }], 1],
    ["empty ledger", [], 1],
  ]) {
    await writeFile(file, JSON.stringify(ledger));
    const result = spawnSync(process.execPath,
      ["scripts/check-publication-migration-readback.mjs", file], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, expected, `${label}: ${result.stderr}`);
  }
  console.log("PASS: baseline accepted; drift, omissions, duplicates, unknown paths and empty ledger rejected.");
} finally {
  await unlink(file).catch(() => {});
  await rmdir(folder);
}
