import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { sharingSession } from "./lib/s06-sharing-browser";
import { s24BlobRun } from "./lib/s24-blob-fixtures.mjs";
import { pilotWorkspace } from "./lib/s13-discovery-fixture";
import { seedConversation, cleanConversation, verifyConversationRemoved } from "./lib/s15-conversation-fixture";
import { conversationJourney } from "./lib/s15-conversation-browser";
import { preflightMessageMedia, cleanMessageMedia } from "./lib/s15-message-media";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as staging,
  workspaceAdministrationStagingSite as siteId } from "./lib/workspace-administration-test-target";

/** Explicit target only: no dotenv, provider configuration, deployment, or remote schema operations. */
export function assertS15Prerequisites(origin: string, commit: string) {
  const target = assertWorkspaceAdministrationTestTarget(process.env, origin);
  assert.equal(new URL(origin).origin, origin);
  const workspace = pilotWorkspace(commit);
  assert.equal(process.env.S15_STAGING_CONVERSATION_GATE, "conversation");
  for (const key of ["TERRAQO_DISCOVERY_NEEDS_V1", "TERRAQO_SCOPED_SHARING_V1", "TERRAQO_CONTEXTUAL_MESSAGING_V1", "TERRAQO_COLLABORATION_V1", "TERRAQO_CLOSURE_V1"])
    assert.equal(process.env[key], "true", key + " must be enabled");
  assert.ok((process.env.TERRAQO_B5_PILOT_WORKSPACE_IDS || "").split(",").map(value => value.trim())
    .some(value => value === "*" || value === workspace), "S15 uses the S13 pilot workspace");
  return { target, workspace, blobRun: s24BlobRun(process.env.PLATFORM_STAGING_S24_BLOB_RUN) };
}

async function exercise(origin: string, commit: string, phase: (value: string) => void) {
  const { target, workspace, blobRun } = assertS15Prerequisites(origin, commit);
  const options = { datasourceUrl: process.env.DATABASE_URL }, db = new PrismaClient(options);
  try {
    phase("database-identity");
    assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database`,
      [{ role: target === "local" ? "terraqo_s22_test" : "terraqo_staging_runtime", database: "postgres" }]);
    phase("message-storage-preflight");
    await preflightMessageMedia(target === "local");
    phase("seed");
    const f = await seedConversation(db, commit, blobRun), dossierIds: string[] = [], conversationIds: string[] = [];
    let result;
    try {
      const browser = await chromium.launch();
      try {
        phase("authenticated-sessions");
        const company = await sharingSession(browser, origin, f.owner, f.password);
        const professional = await sharingSession(browser, origin, f.author, f.password);
        const publisher = await sharingSession(browser, origin, f.publisher, f.password);
        const other = await sharingSession(browser, origin, f.otherOwner, f.password);
        const anonymous = await sharingSession(browser, origin);
        result = await conversationJourney({ company, professional, publisher, other, anonymous }, db, f,
          origin, dossierIds, conversationIds, target === "local", phase);
      } catch (error) {
        const dir = resolve("output/playwright/s15", f.run);
        await mkdir(dir, { recursive: true });
        let index = 0;
        for (const context of browser.contexts()) for (const page of context.pages()) {
          if (new URL(page.url()).origin === origin)
            await page.screenshot({ path: resolve(dir, `failure-${index++}.png`), fullPage: true, timeout: 10_000 }).catch(() => undefined);
        }
        throw error;
      } finally { await browser.close(); }
    } finally {
      phase("cleanup-" + f.run);
      // Always verify with an independent connection, including partial-journey failures.
      try { await cleanMessageMedia(db, f, target === "local"); await cleanConversation(db, f); }
      finally {
        const independent = new PrismaClient(options);
        try { await verifyConversationRemoved(independent, f, dossierIds, conversationIds); }
        finally { await independent.$disconnect(); }
      }
      console.log("S15_CLEANUP_VERIFIED", f.run);
    }
    return { run: f.run, workspace, blobRun, databaseCleanup: "independent-readback", ...result };
  } finally { await db.$disconnect(); }
}

export async function verifyS15Conversation(origin = staging) {
  let phase = "target", journeyPhase: string | undefined;
  try {
    const commit = process.env.S22_STAGING_CANDIDATE_SHA, deployId = process.env.DEPLOY_ID;
    assert.ok(commit && /^[a-f0-9]{40}$/.test(commit));
    assert.ok(deployId && /^[a-f0-9]{24}$/.test(deployId));
    assert.equal(assertS15Prerequisites(origin, commit).target, "staging");
    async function candidate() {
      const marker = await fetch(origin + "/__terraqo_s22_candidate.json?deploy=" + deployId,
        { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
      assert.equal(marker.status, 200);
      assert.deepEqual(await marker.json(), { kind: "workspace-administration", siteId, commit, deployId });
    }
    phase = "candidate";
    await candidate();
    const result = await exercise(origin, commit, step => {
      if (step.startsWith("cleanup-")) journeyPhase = phase;
      phase = step;
    });
    phase = "final-candidate";
    await candidate();
    const receipt = { gate: "s15", passed: true, commit, deployId, ...result };
    console.log(JSON.stringify(receipt));
    return receipt;
  } catch (error) {
    const location = error instanceof Error ? error.stack?.match(/(?:verify-s15-conversation|s15-conversation-[a-z]+)\.ts:\d+:\d+/)?.[0] : undefined;
    console.error(JSON.stringify({ gate: "s15", phase, journeyPhase, location }));
    throw new Error("S15 failed during " + (journeyPhase ?? phase));
  }
}

export async function rehearseS15Conversation(origin: string, commit: string) {
  assert.equal(assertS15Prerequisites(origin, commit).target, "local");
  return exercise(origin, commit, phase => console.log("S15 local", phase));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  verifyS15Conversation().catch(() => { process.exitCode = 1; });
