import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Read-only comparison: this command never connects to or modifies a database.
const source = process.argv[2];
assert.ok(source, "Provide the JSON migration readback from the confirmed staging project.");
const rows = JSON.parse(await readFile(source, "utf8"));
assert.ok(Array.isArray(rows) && rows.length > 0, "Empty migration ledger.");
const directory = path.resolve("prisma/migrations");
const pending = "20261101000100_enterprise_publication_review";
const names = (await readdir(directory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const seen = new Set();
const normalized = [];
const hash = (value) => createHash("sha256").update(value).digest("hex");
for (const row of rows) {
  assert.ok(names.includes(row.migration_name), "Unknown applied migration.");
  assert.ok(!seen.has(row.migration_name), "Duplicate applied migration.");
  assert.match(row.checksum, /^[a-f0-9]{64}$/);
  seen.add(row.migration_name);
  const bytes = await readFile(path.join(directory, row.migration_name, "migration.sql"));
  if (hash(bytes) !== row.checksum) {
    // Windows checkout line endings must not hide SQL edits.
    assert.equal(hash(bytes.toString("utf8").replace(/\r\n/g, "\n")), row.checksum,
      `Migration content drift: ${row.migration_name}`);
    normalized.push(row.migration_name);
  }
}
assert.deepEqual(names.filter((name) => !seen.has(name)), [pending],
  "S24 must be the only unapplied migration for this preflight.");
console.log(JSON.stringify({ passed: true, applied: seen.size, pending,
  lineEndingNormalized: normalized.length, remoteWrites: false,
  limitation: "Ledger comparison only; does not certify backup, live schema or deployment." }));
