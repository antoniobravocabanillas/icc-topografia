import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { migrationSourceChecksums } from "./lib/migration-source-checksums";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assertAttentionTestTarget, attentionStagingOrigin, attentionStagingSite } from "./lib/customer-attention-test-target";
import { verifyAuthenticatedAttention } from "./test-customer-attention-authenticated";

let step = "environment";
async function main() {
  const stage = process.argv[2]; assert.ok(["prepare", "verify"].includes(stage));
  assert.equal(process.env.NETLIFY, "true");
  assert.equal(process.env.SITE_ID, attentionStagingSite);
  assert.equal(process.env.CONTEXT, "production");
  assert.equal(process.env.BRANCH, "codex/customer-attention-release-20261104");
  for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    assert.ok(!existsSync(file), "Cloud checkout must not load developer environment files");
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
  assert.equal(process.env.COMMIT_REF, commit);
  assert.equal(process.env.ATTENTION_STAGING_CANDIDATE_SHA, commit);
  assert.match(process.env.DEPLOY_ID || "", /^[a-f0-9]{24}$/);
  assert.equal(assertAttentionTestTarget(process.env, attentionStagingOrigin), "staging");
  assert.equal(process.env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED, "false");
  const marker = { kind: "customer-attention", siteId: attentionStagingSite, commit, deployId: process.env.DEPLOY_ID };
  if (stage === "prepare") {
    await writeFile("public/__terraqo_attention_candidate.json", JSON.stringify(marker));
    // Browser installation never inherits application/provider credentials.
    const env: NodeJS.ProcessEnv = { NODE_ENV: "production", ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT", "WINDIR", "USERPROFILE", "LOCALAPPDATA"].includes(key.toUpperCase()))) };
    execFileSync(process.execPath, ["node_modules/playwright/cli.js", "install", "chromium"], { env, encoding: "utf8", windowsHide: true, timeout: 180000, stdio: "pipe" });
    console.log("PASS attention staging prepare: isolated target and candidate identity.");
    return;
  }
  const assertServed = async () => {
    const response = await fetch(`${attentionStagingOrigin}/__terraqo_attention_candidate.json?deploy=${marker.deployId}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), marker);
  };
  step = "served-candidate";
  await assertServed();
  const db = new PrismaClient();
  const workspaceIds: string[] = [];
  await mkdir("output", { recursive: true });
  try {
    step = "migration-ledger";
    const ledger = await db.$queryRaw<Array<{ checksum: string }>>`SELECT checksum FROM icc._prisma_migrations WHERE migration_name = '20261104000200_customer_attention_followup' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    assert.equal(ledger.length, 1);
    const sql = await readFile("prisma/migrations/20261104000200_customer_attention_followup/migration.sql");
    assert.ok(migrationSourceChecksums(sql).has(ledger[0].checksum), "Migration source differs from the applied ledger");
    const columns = await db.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_schema='icc' AND table_name='ChatConversation' AND column_name IN ('nextAction','nextActionAt','nextActionCompletedAt')`;
    assert.equal(columns.length, 3);
    step = "fixtures";
    const suffix = randomUUID();
    await mkdir("output", { recursive: true });
    for (const label of ["a", "b"]) {
      const id = `attentiongate-${label}-${suffix}`;
      workspaceIds.push(id);
      // Record the exact cleanup scope before attempting each write.
      await writeFile("output/attention-staging-fixtures.json", JSON.stringify({ ...marker, workspaceIds }));
      await db.terraqoWorkspace.create({ data: { id, name: `Attention gate ${label} ${suffix}`, slug: `attention-gate-${label}-${suffix}`, modules: { create: { code: "CUSTOMER_CHAT", active: true } } } });
    }
    step = "authenticated-browser";
    await verifyAuthenticatedAttention(db, attentionStagingOrigin, workspaceIds[0], workspaceIds[1]);
    step = "final-candidate";
    await assertServed();
  } finally {
    try {
      await db.terraqoWorkspaceModule.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.terraqoWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
      assert.equal(await db.terraqoWorkspace.count({ where: { id: { in: workspaceIds } } }), 0);
      await writeFile("output/attention-staging-cleanup.json", JSON.stringify({ ...marker, remainingWorkspaces: 0 }));
    } finally { await db.$disconnect(); }
  }
  console.log(`PASS attention staging verified: commit=${commit}; deploy=${marker.deployId}; fixtures removed.`);
}
main().catch(error => {
  console.error(JSON.stringify({ attentionStep: step, errorType: /^[A-Za-z]{1,40}$/.test(error?.name || "") ? error.name : "Error" }));
  // Errors can contain synthetic credentials/cookies; emit only a category.
  console.error(JSON.stringify({ attentionStagingFailed: true, code: typeof error?.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : "GATE_REJECTED" }));
  process.exitCode = 1;
});
