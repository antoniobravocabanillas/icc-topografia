import assert from "node:assert/strict";
import {
  readPublicArchiveFilters,
  publicArchiveQuery,
  publicArchiveApiQuery,
  publicArchivePath,
} from "../lib/terraqo/public-archive-navigation";
import { resolveEvidenceReadScope } from "../lib/terraqo/evidence-policy";
import { prisma } from "../lib/prisma";
const filters = readPublicArchiveFilters(
  "?q=campo&type=FIELD_UPDATE&from=2026-10-01&to=2026-10-31&token=secret&cursor=stale",
);
assert.equal(publicArchiveQuery(filters).includes("secret"), false);
assert.equal(publicArchiveApiQuery(filters).has("cursor"), false);
assert.equal(
  publicArchiveApiQuery(filters, "valid-cursor").get("cursor"),
  "valid-cursor",
);
assert.equal(publicArchiveApiQuery(filters).get("audience"), "public");
assert.equal(publicArchiveApiQuery(filters).get("period"), "all");
assert.equal(publicArchiveApiQuery(filters).get("limit"), "20");
assert.equal(
  readPublicArchiveFilters(publicArchivePath("ana", filters).split("?")[1]).q,
  "campo",
);
async function main() {
  const original = prisma.terraqoProfessionalProfile.findUnique;
  try {
    prisma.terraqoProfessionalProfile.findUnique = (async () => ({
      id: "profile",
      userId: "owner",
      username: "ana",
      liveCvEnabled: true,
    })) as unknown as typeof original;
    const publicScope = await resolveEvidenceReadScope({
      actorUserId: "owner",
      professionalProfileId: "profile",
      publicOnly: true,
    });
    assert.equal(publicScope?.audience, "PUBLIC");
    assert.equal(publicScope?.capabilities.viewPreciseLocation, false);
    assert.deepEqual(publicScope?.where, {
      professionalProfileId: "profile",
      deletedAt: null,
      visibility: "PUBLIC",
    });
    assert.equal(
      (
        await resolveEvidenceReadScope({
          actorUserId: "owner",
          professionalProfileId: "profile",
        })
      )?.audience,
      "OWNER",
    );
    prisma.terraqoProfessionalProfile.findUnique = (async () => ({
      id: "profile",
      userId: "owner",
      username: "ana",
      liveCvEnabled: false,
    })) as unknown as typeof original;
    assert.equal(
      await resolveEvidenceReadScope({
        actorUserId: "owner",
        professionalProfileId: "profile",
        publicOnly: true,
      }),
      null,
    );
    console.log(
      "PASS: URL filters, cursor reset, public-only search and authenticated-owner isolation; no database calls.",
    );
  } finally {
    prisma.terraqoProfessionalProfile.findUnique = original;
  }
}
void main();
