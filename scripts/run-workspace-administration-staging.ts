import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { assertWorkspaceAdministrationTestTarget } from "./lib/workspace-administration-test-target";
import { migrationSourceChecksums } from "./lib/migration-source-checksums";
import { verifyHostedWorklogClips } from "./verify-hosted-worklog-clips";
import { verifyWorklogDraftConflict } from "./verify-worklog-draft-conflict";
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
    // S18 fields are selected by shared document readers even with its UI flag off.
    // Reject an older database before building; hooks never apply this migration.
    for (const name of ["20261101000100_enterprise_publication_review", "20261102000100_selection_access_requests", "20261104000100_workspace_invitations", "20261104000200_customer_attention_followup", "20261104000300_workspace_evaluators", "20261120000300_professional_document_lifecycle"]) {
      const rows = await db.$queryRaw<Array<{ checksum: string }>>`SELECT checksum FROM icc._prisma_migrations WHERE migration_name=${name} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      assert.equal(rows.length, 1);
      assert.ok(migrationSourceChecksums(await readFile(`prisma/migrations/${name}/migration.sql`)).has(rows[0].checksum));
    }
    await db.terraqoWorkspaceInvitation.findFirst({ select: { id: true } });
    await db.terraqoProfessionalDocument.findFirst({ select: { id: true, lifecycleVersion: true, withdrawnAt: true, replacesDocumentId: true } });
    await db.terraqoDocumentReplacementAttempt.findFirst({ select: { id: true } });
    const privileges = await db.$queryRaw<Array<{ permitted: boolean }>>`SELECT bool_and(has_table_privilege(current_user, 'icc."TerraqoWorkspaceInvitation"', privilege)) AS permitted FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS privilege`;
    assert.equal(privileges[0]?.permitted, true);
    if (stage === "prepare") {
      await writeFile("public/__terraqo_s22_candidate.json", JSON.stringify(marker));
      const env: NodeJS.ProcessEnv = { NODE_ENV: "production", ...Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|TMPDIR|TEMP|TMP|SYSTEMROOT|WINDIR|USERPROFILE|LOCALAPPDATA)$/i.test(key))) };
      execFileSync(process.execPath, ["node_modules/playwright/cli.js", "install", "chromium"], { env, timeout: 180000, windowsHide: true, stdio: "pipe" });
      const target = process.env.S24_STAGING_DIAGNOSTIC_TARGET;
      if (target && target !== "off") {
        assert.match(target, /^[a-f0-9]{40}\/[a-f0-9]{24}$/);
        const [servedCommit, servedDeploy] = target.split("/");
        const expected = { ...marker, commit: servedCommit, deployId: servedDeploy };
        async function confirmLiveTarget() {
          const reply = await fetch(origin + "/__terraqo_s22_candidate.json?probe=" + marker.deployId,
            { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
          assert.equal(reply.status, 200);
          assert.deepEqual(await reply.json(), expected);
        }
        step = "live-publication-probe";
        await confirmLiveTarget();
        const recovery = process.env.S24_STAGING_RECOVER_INTERRUPTED;
        if (recovery && recovery !== "off") {
          assert.match(recovery, /^[a-f0-9-]{36}\/[a-f0-9]{12}$/);
          const [priorRunId, suffix] = recovery.split("/");
          assert.notEqual(priorRunId, process.env.PLATFORM_STAGING_S24_BLOB_RUN);
          const { recoverInterruptedS24 } = await import("./lib/s24-cleanup");
          await recoverInterruptedS24(db, priorRunId, suffix);
          console.log("PASS interrupted S24 fixture recovery");
        }
        await verifyHostedPublication(process.env);
        await confirmLiveTarget();
        console.log("PASS S24 diagnostic against served commit " + servedCommit);
        return;
      }
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
    if (process.env.S16_COLLABORATION_GATE === "synthetic-only") {
      step = "s16-collaboration";
      const { verifyS16Collaboration } = await import("./verify-s16-collaboration");
      await verifyS16Collaboration();
      await assertServed();
      console.log("PASS S16/S17 staging controls: journey verified; operator fixture-media cleanup and final review still required.");
      return;
    }
    if (process.env.S15_STAGING_CONVERSATION_GATE === "conversation") {
      step = "s15-conversation";
      const { verifyS15Conversation } = await import("./verify-s15-conversation");
      await verifyS15Conversation(origin);
      await assertServed();
      console.log("PASS S15 staging: contextual conversation journey verified.");
      return;
    }
    if (process.env.S14_STAGING_EVALUATION_GATE === "evaluation") {
      step = "s14-evaluation";
      const { verifyS14Evaluation } = await import("./verify-s14-evaluation");
      await verifyS14Evaluation(origin);
      await assertServed();
      console.log("PASS S14 staging: evaluation journey verified.");
      return;
    }
    if (process.env.S13_STAGING_DISCOVERY_GATE === "discovery") {
      step = "s13-discovery";
      const { verifyS13Discovery } = await import("./verify-s13-discovery");
      await verifyS13Discovery(origin);
      await assertServed();
      console.log(`PASS S13 staging: commit=${commit}; deploy=${marker.deployId}; discovery journey verified.`);
      return;
    }
    if (process.env.S12_STAGING_NEED_GATE === "need") {
      step = "s12-need";
      const { verifyS12Need } = await import("./verify-s12-need");
      await verifyS12Need(origin);
      await assertServed();
      console.log(`PASS S12 staging: commit=${commit}; deploy=${marker.deployId}; need journey verified.`);
      return;
    }
    if (process.env.S11_STAGING_RECORD_GATE === "record") {
      step = "s11-record";
      const { verifyS11Record } = await import("./verify-s11-record");
      await verifyS11Record(origin);
      await assertServed();
      console.log(`PASS S11 staging: commit=${commit}; deploy=${marker.deployId}; record journey verified.`);
      return;
    }
    if (process.env.S10_STAGING_ARCHIVE_GATE === "archive") {
      step = "s10-archive";
      const { verifyS10Archive } = await import("./verify-s10-archive");
      await verifyS10Archive(origin);
      await assertServed();
      console.log(`PASS S10 staging: commit=${commit}; deploy=${marker.deployId}; archive journey verified.`);
      return;
    }
    if (process.env.S09_STAGING_VISITOR_GATE === "visitor") {
      step = "s09-visitor";
      const { verifyS09Visitor } = await import("./verify-s09-visitor");
      await verifyS09Visitor(origin);
      await assertServed();
      console.log(`PASS S09 staging: commit=${commit}; deploy=${marker.deployId}; visitor journey verified.`);
      return;
    }
    if (process.env.S08_STAGING_REVIEW_GATE === "review") {
      step = "s08-review";
      const { verifyS08Review } = await import("./verify-s08-review");
      await verifyS08Review(origin);
      await assertServed();
      console.log(`PASS S08 staging: commit=${commit}; deploy=${marker.deployId}; reviewer journey verified.`);
      return;
    }
    if (process.env.S07_STAGING_ENDORSEMENT_GATE === "request") {
      step = "s07-endorsement";
      const { verifyS07Endorsement } = await import("./verify-s07-endorsement");
      await verifyS07Endorsement(origin);
      await assertServed();
      console.log(`PASS S07 staging: commit=${commit}; deploy=${marker.deployId}; endorsement request verified.`);
      return;
    }
    if (process.env.S06_STAGING_VISIBILITY_GATE === "visibility") {
      step = "s06-visibility";
      const { verifyS06Sharing } = await import("./verify-s06-sharing");
      await verifyS06Sharing(origin);
      await assertServed();
      console.log(`PASS S06 staging: commit=${commit}; deploy=${marker.deployId}; visibility and company approvals verified.`);
      return;
    }
    step = "authenticated-browser";
    await verifyWorkspaceAdministration(db, origin);
    step = "worklog-draft-devices";
    await verifyWorklogDraftConflict(origin);
    step = "worklog-clips";
    await verifyHostedWorklogClips(origin);
    if (process.env.S24_STAGING_VERIFICATION === "independent") {
      console.log("S24 requires a separate diagnostic receipt for this served commit.");
    } else if (process.env.PLATFORM_STAGING_S24_CONFIRM) {
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
  const location = typeof error?.stack === "string" ? error.stack.match(/(?:workspace-administration-test-target|run-workspace-administration-staging|verify-worklog-draft-conflict|verify-s22-evaluator-browser|verify-hosted-worklog-clips|verify-s14-evaluation|s14-[a-z-]+|verify-s13-discovery|s13-[a-z-]+|verify-s12-need|s12-[a-z-]+|verify-s11-record|s11-[a-z-]+|verify-s10-archive|s10-[a-z-]+|verify-s09-visitor|s09-[a-z-]+|verify-s08-review|s08-[a-z-]+|verify-s07-endorsement|s07-[a-z-]+|verify-s06-sharing|s06-[a-z-]+)\.ts:\d+:\d+/)?.[0] : undefined;
  console.error(JSON.stringify({ s22Step: step, s22Failed: true, location, code: typeof error?.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : "GATE_REJECTED" }));
  process.exitCode = 1;
});
