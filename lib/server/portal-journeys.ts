import { prisma } from "@/lib/prisma";
import type { WorkspacePortalToken } from "./workspace-portal-session";

export class PortalJourneyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function listPortalJourneys(token: WorkspacePortalToken, cursor?: string) {
  if (token.role !== "PROFESSIONAL") {
    throw new PortalJourneyError("Esta sección requiere tu cuenta profesional.", 403);
  }

  const relationship = await prisma.terraqoWorkRelationship.findFirst({
    where: {
      workspaceId: token.workspaceId,
      status: "ACTIVE",
      member: { workspaceId: token.workspaceId, userId: token.sub, active: true },
    },
    select: {
      id: true,
      area: true,
      modality: true,
      workSite: true,
      startDate: true,
      member: { select: { title: true } },
      currentProject: { select: { id: true, title: true } },
    },
  });

  if (!relationship) {
    return {
      schemaVersion: 1 as const,
      workspaceSlug: token.workspaceSlug,
      relationship: null,
      records: [],
      nextCursor: null,
    };
  }

  const checkIns = await prisma.terraqoAttendanceEvent.findMany({
    take: 31,
    orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where: {
      workspaceId: token.workspaceId,
      userId: token.sub,
      workRelationshipId: relationship.id,
      type: "CHECK_IN",
    },
    select: {
      id: true,
      capturedAt: true,
      status: true,
      context: true,
      project: { select: { id: true, title: true } },
    },
  });

  const page = checkIns.slice(0, 30);
  const approvals = page.length
    ? await prisma.terraqoAttendanceApproval.findMany({
        where: { workRelationshipId: relationship.id, checkInEventId: { in: page.map((entry) => entry.id) } },
        select: {
          checkInEventId: true,
          checkOutEventId: true,
          regularMinutes: true,
          additionalDetectedMinutes: true,
          additionalApprovedMinutes: true,
          status: true,
          requiresReview: true,
          updatedAt: true,
        },
      })
    : [];
  const approvalByCheckIn = new Map(approvals.map((approval) => [approval.checkInEventId, approval]));
  const checkOutIds = approvals.flatMap((approval) => approval.checkOutEventId ? [approval.checkOutEventId] : []);
  const checkOuts = checkOutIds.length
    ? await prisma.terraqoAttendanceEvent.findMany({
        where: {
          id: { in: checkOutIds },
          workspaceId: token.workspaceId,
          userId: token.sub,
          workRelationshipId: relationship.id,
          type: "CHECK_OUT",
        },
        select: { id: true, capturedAt: true, status: true },
      })
    : [];
  const checkOutById = new Map(checkOuts.map((entry) => [entry.id, entry]));

  return {
    schemaVersion: 1 as const,
    workspaceSlug: token.workspaceSlug,
    relationship: {
      id: relationship.id,
      title: relationship.member.title,
      area: relationship.area,
      modality: relationship.modality,
      workSite: relationship.workSite,
      startDate: relationship.startDate?.toISOString() ?? null,
      currentProject: relationship.currentProject,
    },
    records: page.map((entry) => {
      const approval = approvalByCheckIn.get(entry.id);
      const checkOut = approval?.checkOutEventId ? checkOutById.get(approval.checkOutEventId) : null;
      return {
        id: entry.id,
        entryAt: entry.capturedAt.toISOString(),
        exitAt: checkOut?.capturedAt.toISOString() ?? null,
        context: entry.context,
        entryStatus: entry.status,
        exitStatus: checkOut?.status ?? null,
        project: entry.project,
        regularMinutes: approval?.regularMinutes ?? 0,
        additionalDetectedMinutes: approval?.additionalDetectedMinutes ?? 0,
        additionalApprovedMinutes: approval?.additionalApprovedMinutes ?? 0,
        reviewStatus: approval?.status ?? null,
        requiresReview: approval?.requiresReview ?? false,
        updatedAt: (approval?.updatedAt ?? entry.capturedAt).toISOString(),
      };
    }),
    nextCursor: checkIns.length > 30 ? page.at(-1)?.id ?? null : null,
  };
}
