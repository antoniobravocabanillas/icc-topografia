import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { listPortalJourneys, PortalJourneyError } from "../lib/server/portal-journeys";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  const original = {
    relationship: prisma.terraqoWorkRelationship.findFirst,
    events: prisma.terraqoAttendanceEvent.findMany,
    approvals: prisma.terraqoAttendanceApproval.findMany,
  };
  const token: WorkspacePortalToken = {
    sub: "professional-user",
    workspaceId: "workspace",
    workspaceSlug: "fixture",
    role: "PROFESSIONAL",
    iat: 1,
    exp: 2,
  };
  let relationshipAvailable = true;
  let eventQuery = 0;

  prisma.terraqoWorkRelationship.findFirst = (async (args: { where: unknown }) => {
    assert.deepEqual(args.where, {
      workspaceId: "workspace",
      status: "ACTIVE",
      member: { workspaceId: "workspace", userId: "professional-user", active: true },
    });
    return relationshipAvailable ? {
      id: "relationship",
      area: "Operaciones",
      modality: "Campo",
      workSite: "Lima",
      startDate: new Date("2026-01-01T00:00:00Z"),
      member: { title: "Topógrafo" },
      currentProject: { id: "project", title: "Proyecto autorizado" },
    } : null;
  }) as unknown as typeof original.relationship;
  prisma.terraqoAttendanceEvent.findMany = (async (args: { where: Record<string, unknown>; take?: number }) => {
    assert.equal(args.where.workspaceId, "workspace");
    assert.equal(args.where.userId, "professional-user");
    assert.equal(args.where.workRelationshipId, "relationship");
    eventQuery += 1;
    if (args.where.type === "CHECK_IN") {
      assert.equal(args.take, 31);
      return [{
        id: "check-in",
        capturedAt: new Date("2026-10-20T13:00:00Z"),
        status: "ACCEPTED",
        context: "PERSONAL_FIELD",
        project: null,
      }];
    }
    assert.deepEqual(args.where.id, { in: ["check-out"] });
    return [{ id: "check-out", capturedAt: new Date("2026-10-20T22:00:00Z"), status: "ACCEPTED" }];
  }) as unknown as typeof original.events;
  prisma.terraqoAttendanceApproval.findMany = (async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.workRelationshipId, "relationship");
    assert.deepEqual(args.where.checkInEventId, { in: ["check-in"] });
    return [{
      checkInEventId: "check-in",
      checkOutEventId: "check-out",
      regularMinutes: 480,
      additionalDetectedMinutes: 60,
      additionalApprovedMinutes: 30,
      status: "PARTIALLY_APPROVED",
      requiresReview: true,
      updatedAt: new Date("2026-10-20T23:00:00Z"),
    }];
  }) as unknown as typeof original.approvals;

  try {
    for (const role of ["ADMIN", "CLIENT", "MEMBER", "VIEWER"] as const) {
      await assert.rejects(
        listPortalJourneys({ ...token, role }),
        (error: unknown) => error instanceof PortalJourneyError && error.status === 403,
      );
    }
    const page = await listPortalJourneys(token);
    assert.equal(page.relationship?.id, "relationship");
    assert.equal(page.records.length, 1);
    assert.deepEqual(page.records[0], {
      id: "check-in",
      entryAt: "2026-10-20T13:00:00.000Z",
      exitAt: "2026-10-20T22:00:00.000Z",
      context: "PERSONAL_FIELD",
      entryStatus: "ACCEPTED",
      exitStatus: "ACCEPTED",
      project: null,
      regularMinutes: 480,
      additionalDetectedMinutes: 60,
      additionalApprovedMinutes: 30,
      reviewStatus: "PARTIALLY_APPROVED",
      requiresReview: true,
      updatedAt: "2026-10-20T23:00:00.000Z",
    });
    assert.equal(page.nextCursor, null);
    assert.equal(eventQuery, 2);

    relationshipAvailable = false;
    const empty = await listPortalJourneys(token);
    assert.equal(empty.relationship, null);
    assert.deepEqual(empty.records, []);
    assert.equal(eventQuery, 2, "A missing active relationship must not query attendance rows.");
    console.log("Portal journeys: OK (professional-only, exact tenant/owner scope, bounded pagination and no location disclosure)." );
  } finally {
    prisma.terraqoWorkRelationship.findFirst = original.relationship;
    prisma.terraqoAttendanceEvent.findMany = original.events;
    prisma.terraqoAttendanceApproval.findMany = original.approvals;
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
