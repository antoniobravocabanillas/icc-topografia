import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { assertWorkspaceAdministrationTestTarget } from "./lib/workspace-administration-test-target";
import { migrationSourceChecksums } from "./lib/migration-source-checksums";
import { verifyWorkspaceAdministration } from "./test-workspace-administration-authenticated";
import { verifyHostedPublication } from "./lib/hosted-public-acceptance";

const origin = "https://terraqo-platform-staging.netlify.app";
let step = "environment";
async function main() {
  const stage = process.argv[2];
  assert.ok(stage === "prepare" || stage === "verify");
  assert.equal(process.env.NETLIFY, "true");
  assert.equal(process.env.CONTEXT, "production"); // Production context of the isolated staging site only.
  assert.equal(process.env.BRANCH, "codex/s22-evaluator-local");
  assert.equal(process.env.TERRAQO_WORKSPACE_EVALUATORS_V1, "true");
  assert.equal(process.env.PLATFORM_STAGING_CLOUD_PHASE, "workspace-administration");
  for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) assert.ok(!existsSync(file));
  step = "target";
  assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "staging");
  step = "candidate";
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
  assert.equal(process.env.COMMIT_REF, commit);
  assert.equal(process.env.S22_STAGING_CANDIDATE_SHA, commit);
  assert.match(process.env.DEPLOY_ID || "", /^[a-f0-9]{24}$/);
  const marker = { kind: "workspace-administration", siteId: process.env.SITE_ID, commit, deployId: process.env.DEPLOY_ID };
  const db = new PrismaClient();
  try {
    step = "database-authority";
    const identity = await db.$queryRaw<Array<{ role: string; database: string; exposed: boolean }>>`SELECT current_user AS role, current_database() AS database, has_schema_privilege('anon','icc','USAGE') OR has_schema_privilege('authenticated','icc','USAGE') OR has_schema_privilege('service_role','icc','USAGE') AS exposed`;
    assert.deepEqual(identity, [{ role: "terraqo_staging_runtime", database: "postgres", exposed: false }]);
    // Read-only preflight in both stages: never apply migrations from a deploy hook.
    step = "migration-ledger";
    for (const name of ["20261101000100_enterprise_publication_review", "20261102000100_selection_access_requests", "20261104000100_workspace_invitations", "20261104000200_customer_attention_followup", "20261104000300_workspace_evaluators"]) {
      const rows = await db.$queryRaw<Array<{ checksum: string }>>`SELECT checksum FROM icc._prisma_migrations WHERE migration_name=${name} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      assert.equal(rows.length, 1);
      assert.ok(migrationSourceChecksums(await readFile(`prisma/migrations/${name}/migration.sql`)).has(rows[0].checksum));
    }
    await db.terraqoWorkspaceInvitation.findFirst({ select: { id: true } });
    const privileges = await db.$queryRaw<Array<{ permitted: boolean }>>`SELECT bool_and(has_table_privilege(current_user, 'icc."TerraqoWorkspaceInvitation"', privilege)) AS permitted FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS privilege`;
    assert.equal(privileges[0]?.permitted, true);
    if (stage === "prepare") {
      await writeFile("public/__terraqo_s22_candidate.json", JSON.stringify(marker));
      const env: NodeJS.ProcessEnv = { NODE_ENV: "production", ...Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|TMPDIR|TEMP|TMP|SYSTEMROOT|WINDIR|USERPROFILE|LOCALAPPDATA)$/i.test(key))) };
      execFileSync(process.execPath, ["node_modules/playwright/cli.js", "install", "chromium"], { env, timeout: 180000, windowsHide: true, stdio: "pipe" });
      console.log("PASS S22 staging preflight: target, commit and migration ledger verified; no fixtures written.");
      return;
    }
    const assertServed = async () => {
      const response = await fetch(`${origin}/__terraqo_s22_candidate.json?deploy=${marker.deployId}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), marker);
    };
    step = "served-candidate";
    await assertServed();
    step = "authenticated-browser";
    await verifyWorkspaceAdministration(db, origin);
    if (process.env.PLATFORM_STAGING_S24_CONFIRM) {
      step = "public-acceptance";
      await assertServed();
      await verifyHostedPublication(process.env);
    }
    step = "final-candidate";
    await assertServed();
    console.log(`PASS S22 staging: commit=${commit}; deploy=${marker.deployId}; exact fixtures removed.`);
  } finally { await db.$disconnect(); }
}
main().catch(error => {
  // Assertions may contain tokens/URLs. Log only structural diagnostics.
  const location = typeof error?.stack === "string" ? error.stack.match(/(?:workspace-administration-test-target|run-workspace-administration-staging)\.ts:\d+:\d+/)?.[0] : undefined;
  console.error(JSON.stringify({ s22Step: step, s22Failed: true, location, code: typeof error?.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : "GATE_REJECTED" }));
  process.exitCode = 1;
});
