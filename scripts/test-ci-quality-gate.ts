import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/quality-gate.yml"), "utf8");

assert.match(workflow, /^permissions:\s*\n\s+contents: read$/m, "CI must default to read-only repository access.");
assert.match(workflow, /timeout-minutes: 20/, "CI must have a bounded execution time.");
assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/, "Checkout must be pinned to an immutable commit.");
assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/, "Node setup must be pinned to an immutable commit.");
assert.match(workflow, /node-version: 22\.13\.0/, "CI must use the repository's minimum supported Node 22 runtime.");

for (const command of [
  "npm ci",
  "npm run prisma:generate",
  "npm audit --omit=dev --audit-level=moderate",
  "npm run check:encoding",
  "npm run check:release-candidate",
  "npm run lint",
  "npm run typecheck",
  "npm run test:terraqo-local-contracts",
  "npm run build",
]) {
  assert.ok(workflow.includes(`run: ${command}`), `CI is missing required command: ${command}`);
}

const installIndex = workflow.indexOf("run: npm ci");
const generateIndex = workflow.indexOf("run: npm run prisma:generate");
const typecheckIndex = workflow.indexOf("run: npm run typecheck");
const contractsIndex = workflow.indexOf("run: npm run test:terraqo-local-contracts");
const buildIndex = workflow.indexOf("run: npm run build");
assert.ok(installIndex < generateIndex, "Prisma generation must run after the clean install.");
assert.ok(generateIndex < typecheckIndex, "Prisma generation must run before typecheck.");
assert.ok(generateIndex < contractsIndex, "Prisma generation must run before contracts that import Prisma types.");
assert.ok(generateIndex < buildIndex, "Prisma generation must run before the production build.");

const hygieneIndex = workflow.indexOf("run: npm run check:release-candidate");
assert.ok(hygieneIndex > installIndex, "Release candidate hygiene must run after the locked install.");
assert.ok(hygieneIndex < buildIndex, "Release candidate hygiene must run before the production build.");

assert.doesNotMatch(workflow, /prisma:(?:deploy|migrate|push)/, "CI must not mutate a database.");
assert.doesNotMatch(workflow, /netlify\s+deploy|npm\s+run\s+deploy/, "CI must not deploy.");
assert.doesNotMatch(workflow, /secrets\./, "The local quality gate must not require repository secrets.");

console.log("CI quality gate contract: OK (read-only permissions, pinned actions, bounded local checks).\n");
