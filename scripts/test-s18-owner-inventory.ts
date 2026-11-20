import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { listOwnedAccessCollections, ScopedSharingError } from "../lib/terraqo/scoped-sharing";

async function main() {
const profileRead = prisma.terraqoProfessionalProfile.findUnique;
const collectionRead = prisma.terraqoShareCollection.findMany;
let hasProfile = true;
let reads = 0;
try {
  prisma.terraqoProfessionalProfile.findUnique = (async (args: { where: { userId: string } }) => {
    assert.equal(args.where.userId, "owner-fixture");
    return hasProfile ? { id: "profile-fixture" } : null;
  }) as unknown as typeof profileRead;
  prisma.terraqoShareCollection.findMany = (async (args: { where: unknown; select: Record<string, unknown> }) => {
    reads++;
    assert.deepEqual(args.where, { professionalProfileId: "profile-fixture", createdById: "owner-fixture", lifecycle: { not: "ARCHIVED" } });
    assert.deepEqual(Object.keys(args.select).sort(), ["grants", "id", "publicProjection", "title", "version"]);
    const grants = args.select.grants as { select: Record<string, unknown> };
    assert.equal(grants.select.tokenHash, undefined);
    assert.deepEqual(grants.select.subjectUser, { select: { name: true } });
    return [];
  }) as unknown as typeof collectionRead;
  assert.deepEqual(await listOwnedAccessCollections("owner-fixture"), []);
  hasProfile = false;
  await assert.rejects(listOwnedAccessCollections("owner-fixture"), error => error instanceof ScopedSharingError && error.status === 409);
  assert.equal(reads, 1, "Missing profile must stop before inventory query");
  console.log("PASS S18 owner inventory query contract (mock DB): dual owner predicates, minimal fields, no token/private media, missing profile denied.");
} finally {
  prisma.terraqoProfessionalProfile.findUnique = profileRead;
  prisma.terraqoShareCollection.findMany = collectionRead;
  await prisma.$disconnect();
}
}

main().catch(error => { console.error(error); process.exitCode = 1; });
