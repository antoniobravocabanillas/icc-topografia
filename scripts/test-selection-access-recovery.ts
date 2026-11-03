import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma";
import { resolveRequestedSelectionAccess } from "../lib/terraqo/selection-access-request";

async function main() {
  let result: unknown = null;
  let query: unknown;
  const delegate = prisma.terraqoSelectionAccessRequest;
  const original = delegate.findFirst;
  delegate.findFirst = (async (input: unknown) => { query = input; return result; }) as typeof original;
  try {
    const target = { targetType: "public-link" as const, target: "revoked-link" };
    assert.deepEqual(await resolveRequestedSelectionAccess("requester", target), { available: false });
    const args = query as { where: Record<string, unknown>; select: unknown };
    assert.equal(args.where.requesterId, "requester");
    assert.equal(args.where.status, "APPROVED");
    assert.equal(args.where.targetHash, createHash("sha256").update(JSON.stringify(["public-link", "revoked-link"])).digest("hex"));
    assert.deepEqual(args.where.collection, { lifecycle: { not: "ARCHIVED" } });
    const grant = args.where.grant as Record<string, unknown>;
    assert.equal(grant.subjectUserId, "requester");
    assert.equal(grant.lifecycle, "ACTIVE");
    assert.equal(grant.revokedAt, null);
    assert.deepEqual(grant.scopes, { has: "VIEW_COLLECTION" });
    assert.ok((grant.expiresAt as { gt: Date }).gt instanceof Date);
    assert.deepEqual(args.select, { collectionId: true, grant: { select: { collectionId: true, expiresAt: true } } });
    result = { collectionId: "selection-1", grant: { collectionId: "selection-1", expiresAt: new Date("2035-01-01T00:00:00Z") } };
    assert.deepEqual(await resolveRequestedSelectionAccess("requester", target), { available: true, href: "/portal/selecciones/selection-1", expiresAt: "2035-01-01T00:00:00.000Z" });
    result = { collectionId: "selection-1", grant: { collectionId: "other", expiresAt: new Date() } };
    assert.deepEqual(await resolveRequestedSelectionAccess("requester", target), { available: false });
    console.log("PASS: requester/live-grant query, neutral absence, minimal DTO and mismatched grant rejection. Database mocked.");
  } finally { delegate.findFirst = original; await prisma.$disconnect(); }
}
void main();
