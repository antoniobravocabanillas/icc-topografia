import { s24BlobRun } from "./s24-blob-fixtures.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { cloudFailureDiagnostic, stagingCloudGateEnvironment, stagingCloudSite } from "./platform-staging-cloud";
import { stagingRunnerEnvironmentFromValues, stagingRunnerKeys } from "./platform-staging-runner";

const run = promisify(execFile);
const confirmation = "mghdpciewbsowjrjwmwk:s24-http-fixtures";

/** Run only after the parent has verified the served S22 deploy marker. */
export async function verifyHostedPublication(source: NodeJS.ProcessEnv) {
  assert.equal(source.PLATFORM_STAGING_S24_CONFIRM, confirmation);
  assert.equal(source.SITE_ID, stagingCloudSite);
  assert.equal(source.BRANCH, "codex/s22-evaluator-local");
  assert.equal(source.CONTEXT, "production");
  assert.equal(source.NETLIFY, "true");
  assert.equal(source.TERRAQO_WORKSPACE_PUBLICATION_V1, "true");
  const values = Object.fromEntries(stagingRunnerKeys.filter(k => source[k] !== undefined &&
    k !== "OPENAI_API_KEY" && k !== "GROQ_API_KEY").map(k => [k, source[k]]));
  const environment: NodeJS.ProcessEnv = stagingCloudGateEnvironment(stagingRunnerEnvironmentFromValues(values, source), "s24");
  assert.ok(source.DATABASE_URL && environment.DATABASE_URL === source.DATABASE_URL);
  const runId = s24BlobRun(source.PLATFORM_STAGING_S24_BLOB_RUN);
  environment.PLATFORM_STAGING_S24_BLOB_RUN = runId;
  try {
    const { stdout } = await run(process.execPath, ["--conditions=react-server", "--import", "tsx", resolve("scripts/test-platform-staging-s24-http.ts")], {
      env: environment, timeout: 720_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    });
    const receipt = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!);
    assert.equal(receipt.runId, runId);
    assert.equal(receipt.passed, true);
    assert.equal(receipt.databaseCleanup, "matched");
    assert.equal(receipt.blobCleanup, "external");
    assert.ok(stdout.includes("PASS S24 hosted WorkCase scope, navigation, withdrawal and exact group cleanup."));
    assert.ok(stdout.includes("PASS hosted S10/S11 public archive:"));
    console.log("PASS hosted S10/S11 date range, two-plan gallery and return at 1280/375/320.");
    console.log(JSON.stringify({ gate: "s24", receipt }));
    console.log("PASS hosted WorkCase navigation and withdrawal, S24 selected and withheld attachment bytes, and retained database baseline.");
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    const diagnostic = cloudFailureDiagnostic(`${failure.stdout ?? ""}\n${failure.stderr ?? ""}`);
    const stage = /Hosted WorkCase check failed during ([a-z ,/-]{1,80})\./.exec(failure.stderr ?? "")?.[1];
    const reads = failure.stdout?.match(/^S24_READ (owner|reviewer|stranger|anonymous) (download|media|selection) [1-5]\d\d$/gm) ?? [];
    console.log(JSON.stringify({ ...diagnostic, workCaseStage: stage, recentGrantReads: reads.slice(-5) }));
    throw new Error("Hosted publication acceptance failed");
  }

}
