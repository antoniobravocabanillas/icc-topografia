import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { cleanS16, ownedIds, type S16Fixture } from "./lib/s16-collaboration-fixture";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { chromium } from "@playwright/test";
import { sharingSession } from "./lib/s06-sharing-browser";
import { verifyDisclosureJourney } from "./lib/s17-disclosure-browser";
import { s24BlobFixtures } from "./lib/s24-blob-fixtures.mjs";

// Operator-only recovery for this interrupted, synthetic staging run. Never a general tenant deletion tool.
async function main() {
  assert.equal(process.argv[2], "be3a5877-e7fa-4208-b44f-6685893d7726");
  const run = process.argv[2], workspace = "s13-need-a187f7c9ebb8ddc7";
  const env = parse(await readFile("C:/Users/Binv/Documents/New project/icc-topografia/.env.platform-staging.local", "utf8"));
  const url = new URL(env.STAGING_BACKUP_DATABASE_URL);
  assert.equal(url.hostname, "aws-1-sa-east-1.pooler.supabase.com");
  assert.equal(decodeURIComponent(url.username), "postgres.mghdpciewbsowjrjwmwk");
  assert.equal(url.pathname, "/postgres");
  url.searchParams.set("schema", "icc"); url.searchParams.set("sslmode", "require");
  process.env.DATABASE_URL = url.href;
  process.env.TERRAQO_CERTIFICATE_DISCLOSURE_V1 = "true";
  const db = new PrismaClient({ datasourceUrl: url.href });
  try {
    assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database`, [{ role: "postgres", database: "postgres" }]);
    const owner = "s13-company-" + run, author = "s13-public-" + run, publisher = "s13-scoped-" + run;
    const otherOwner = "s14-other-" + run;
    const actors = [owner, author, publisher, otherOwner];
    const users = await db.user.findMany({ where: { id: { in: actors } }, select: { id: true, email: true } });
    assert.equal(users.length, 4);
    assert.ok(users.every(u => u.email === u.id + "@example.invalid"));
    const ws = await db.terraqoWorkspace.findUniqueOrThrow({ where: { id: workspace } });
    assert.equal(ws.ownerUserId, owner); assert.equal(ws.slug, "s13-empresa-" + run);
    const other = await db.terraqoWorkspace.findUniqueOrThrow({ where: { id: otherOwner } });
    assert.equal(other.ownerUserId, otherOwner); assert.equal(other.slug, otherOwner);
    const records = await db.terraqoWorklogEntry.findMany({ where: { authorId: { in: [author, publisher] } }, orderBy: { occurredAt: "asc" } });
    assert.equal(records.length, 5); assert.ok(records.every(r => r.currentRevisionId));
    const revisions = await db.terraqoWorklogRevision.findMany({ where: { id: { in: records.map(r => r.currentRevisionId!) } } });
    const mapped = records.map(r => { const revision = revisions.find(v => v.id === r.currentRevisionId); assert.ok(revision);
      return { id: r.id, revision: revision.id, contentHash: revision.contentHash, title: r.title, summary: r.summary }; });
    const need = await db.terraqoWorkNeed.findFirstOrThrow({ where: { workspaceId: workspace, createdById: owner, operationKey: run } });
    const workCase = await db.terraqoWorkCase.findFirstOrThrow({ where: { createdById: author } });
    const collections = await db.terraqoShareCollection.findMany({ where: { createdById: publisher }, include: { publicProjection: true } });
    assert.equal(collections.length, 2);
    const pub = collections.find(c => c.publicProjection)!;
    assert.ok(pub); const alternate = collections.find(c => c.id !== pub.id)!;
    const media = await db.terraqoWorklogMedia.findFirstOrThrow({ where: { worklog: { authorId: author } } });
    assert.ok(media.storageKey.startsWith("worklog-evidence/s24-test/52019a95-23c1-4607-a9a0-e26988915cb1/"));
    assert.ok(need.currentRevisionId);
    const profile = await db.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: author } });
    const scopedProfile = await db.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: publisher } });
    assert.ok(profile.username);
    const [[plan], additionalPhotos] = s24BlobFixtures("52019a95-23c1-4607-a9a0-e26988915cb1");
    assert.equal(media.storageKey, plan.key);
    const key = run.replaceAll("-", "").slice(0, 16);
    const f: S16Fixture = { run, workspace, slug: ws.slug, owner, author, publisher, otherOwner, otherWorkspace: other.id,
      need: need.id, revision: need.currentRevisionId, workCase: workCase.id, collection: pub.id,
      alternate: alternate.id, projection: pub.publicProjection!.id, first: mapped[0], second: mapped[1],
      solo: mapped[2], limited: mapped[3], privateRecord: mapped[4], plan, additionalPhotos, photoId: media.id,
      password: "", term: "nivel" + key, missing: "calibracion" + key, hidden: "reservado" + key,
      username: profile.username, profile: profile.id, scopedProfile: scopedProfile.id };
    const ids = ownedIds();
    ids.collaborations = (await db.terraqoCollaboration.findMany({ where: { workspaceId: workspace }, select: { id: true } })).map(r => r.id);
    ids.conversations = (await db.terraqoConversation.findMany({ where: { workspaceId: workspace, createdById: owner }, select: { id: true } })).map(r => r.id);
    if (process.argv[3] === "--verify-disclosure") {
      const origin = "https://terraqo-platform-staging.netlify.app";
      const marker = await fetch(origin + "/__terraqo_s22_candidate.json", { cache: "no-store" }).then(r => r.json());
      assert.equal(marker.commit, "a187f7c9ebb8ddc7af3a3af71109dcd98bbd3b65");
      assert.equal(marker.deployId, "6b0071c2c0bc5284f750dc3e");
      assert.equal(marker.siteId, "6b8c43fb-6083-450a-9b85-46a820fb6358");
      const collaboration = await db.terraqoCollaboration.findFirstOrThrow({ where: { workspaceId: workspace, professionalUserId: author, status: "CLOSED" } });
      assert.equal(ids.collaborations.length, 1);
      const password = randomBytes(32).toString("base64url");
      const passwordHash = await bcrypt.hash(password, 10);
      await db.$transaction(async tx => {
        const disclosure = { certificate: { closure: { collaborationId: collaboration.id } } };
        await tx.terraqoCertificateDisclosureEvent.deleteMany({ where: { disclosure } });
        await tx.terraqoCertificateDisclosure.deleteMany({ where: disclosure });
        await tx.user.updateMany({ where: { id: { in: actors }, email: { in: actors.map(id => id + "@example.invalid") } }, data: { passwordHash } });
      });
      const browser = await chromium.launch();
      try {
        const sessions = { company: await sharingSession(browser, origin, owner, password),
          professional: await sharingSession(browser, origin, author, password),
          other: await sharingSession(browser, origin, otherOwner, password), anonymous: await sharingSession(browser, origin) };
        const pages = [await sessions.company.newPage(), await sessions.professional.newPage()] as const;
        await pages[0].goto(origin + "/admin/colaboraciones/" + collaboration.id + "/cierre");
        await pages[1].goto(origin + "/portal/colaboraciones/" + collaboration.id + "/cierre");
        const artifactDir = "output/s17-disclosure-focused"; await mkdir(artifactDir, { recursive: true });
        await verifyDisclosureJourney({ origin, collaborationId: collaboration.id, db, f, sessions, pages: [...pages], artifactDir });
        console.log("PASS focused S17 hosted disclosure matrix; cleanup still required");
      } finally { await browser.close(); }
      return;
    }
    if (process.argv[3] !== "--execute") { console.log("PASS exact interrupted fixture ownership; no mutation"); return; }
    await cleanS16(db, f, ids);
    console.log("PASS interrupted S17 fixture removed; independent readback verified");
  } finally { await db.$disconnect(); }
}
main().catch((error: unknown) => {
  const e = error as { name?: string; code?: string; stack?: string; actual?: unknown; expected?: unknown };
  console.error(JSON.stringify({ failed: true, name: e.name, code: e.code,
    locations: e.stack?.split("\n").filter(line => /at .*scripts[\\/]/.test(line)).slice(0, 4),
    actual: typeof e.actual === "number" ? e.actual : undefined, expected: typeof e.expected === "number" ? e.expected : undefined }));
  process.exitCode = 1;
});
