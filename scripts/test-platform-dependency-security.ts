import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { Schema } from "effect";

// GHSA-7589-6fvf-x4pw: exercise the installed dependency rather than a source-text assertion.
const template = Schema.is(Schema.TemplateLiteral(Schema.String, ":", Schema.String, ":", Schema.String, "X"));
assert.equal(template("left:middle:rightX"), true);
const start = performance.now();
assert.equal(template(":".repeat(5000)), false);
assert.equal(template("a:".repeat(5000) + "!"), false);
assert.ok(performance.now() - start < 1000, "Adversarial templates must not monopolize the event loop");
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
assert.equal(lock.packages["node_modules/effect"].version, "3.22.1");
assert.equal(lock.packages["node_modules/prisma"].version, "6.19.3", "No unreviewed Prisma major upgrade");
for (const name of ["next", "eslint-config-next", "@next/env", "@next/eslint-plugin-next"])
  assert.equal(lock.packages[`node_modules/${name}`].version, "15.5.29");
console.log("PASS dependency patch baseline and Effect valid/adversarial template controls; Next exploit closure relies on upstream patched release, not this version assertion alone.");
