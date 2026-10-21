import assert from "node:assert/strict";

import { confirmedLocalDisposableDatabaseUrl } from "./lib/confirmed-local-disposable-database";

function confirm(value: string | undefined, expected: string | undefined) {
  return confirmedLocalDisposableDatabaseUrl({
    value,
    expected,
    valueVariable: "TEST_DATABASE_URL",
    expectedVariable: "TEST_EXPECTED_DATABASE",
  });
}

const local = "postgresql://test:secret@127.0.0.1:5432/terraqo_isolation_test?schema=icc";
assert.equal(confirm(local, "terraqo_isolation_test"), local);
assert.throws(() => confirm(undefined, "terraqo_isolation_test"), /TEST_DATABASE_URL/);
assert.throws(() => confirm(local, undefined), /TEST_EXPECTED_DATABASE/);
assert.throws(() => confirm("postgresql://test:secret@db.example.com/terraqo_isolation_test", "terraqo_isolation_test"), /localhost/);
assert.throws(() => confirm(local, "another_test"), /no coincide/);
assert.throws(() => confirm("postgresql://test:secret@localhost/terraqo", "terraqo"), /desechable/);
assert.throws(() => confirm("mysql://test:secret@localhost/terraqo_test", "terraqo_test"), /PostgreSQL/);

console.log("PASS: mutating database gates require an exact local disposable PostgreSQL destination.");
