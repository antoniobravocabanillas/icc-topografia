import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EvidenceReadScope } from "@/lib/terraqo/evidence-policy";
import {
  worklogArchivePeriod,
  type WorklogArchiveFilters,
} from "@/lib/terraqo/worklog-archive-contract";

type ArchiveCursorPosition = {
  occurredAt: Date;
  id: string;
};

type WorklogIdRow = {
  id: string;
  occurredAt: Date;
};

export function isWorklogFullTextEnabled() {
  return process.env.TERRAQO_WORKLOG_FTS_V1 === "true";
}

function visibilityCondition(scope?: EvidenceReadScope) {
  if (!scope || scope.audience === "OWNER") return null;
  if (scope.audience === "PUBLIC") {
    return Prisma.sql`w."visibility"::text = 'PUBLIC'`;
  }

  const alternatives: Prisma.Sql[] = [
    Prisma.sql`w."visibility"::text = 'COMMUNITY'`,
  ];
  if (scope.profile.liveCvEnabled) {
    alternatives.push(Prisma.sql`w."visibility"::text = 'PUBLIC'`);
  }
  if (scope.workspaceIds.length) {
    alternatives.push(
      Prisma.sql`(
        w."visibility"::text = 'WORKSPACE'
        AND w."workspaceId" IN (${Prisma.join(scope.workspaceIds)})
      )`,
    );
  }
  return Prisma.sql`(${Prisma.join(alternatives, " OR ")})`;
}

function archiveConditions(input: {
  professionalProfileId: string;
  filters: WorklogArchiveFilters;
  scope?: EvidenceReadScope;
  cursor?: ArchiveCursorPosition;
}) {
  const { filters } = input;
  const conditions: Prisma.Sql[] = [
    Prisma.sql`w."professionalProfileId" = ${input.professionalProfileId}`,
    Prisma.sql`w."deletedAt" IS NULL`,
    Prisma.sql`w."searchVector" @@ websearch_to_tsquery('spanish'::regconfig, ${filters.query || ""})`,
  ];
  const period = worklogArchivePeriod(filters);
  if (period?.gte) conditions.push(Prisma.sql`w."occurredAt" >= ${period.gte}`);
  if (period?.lt) conditions.push(Prisma.sql`w."occurredAt" < ${period.lt}`);
  if (filters.type) conditions.push(Prisma.sql`w."type"::text = ${filters.type}`);
  if (filters.projectId) conditions.push(Prisma.sql`w."projectId" = ${filters.projectId}`);
  if (filters.evidenceStatus) {
    conditions.push(
      Prisma.sql`w."evidenceStatus"::text = ${filters.evidenceStatus}`,
    );
  }
  const visibility = visibilityCondition(input.scope);
  if (visibility) conditions.push(visibility);
  if (input.cursor) {
    conditions.push(
      Prisma.sql`(
        w."occurredAt" < ${input.cursor.occurredAt}
        OR (w."occurredAt" = ${input.cursor.occurredAt} AND w."id" < ${input.cursor.id})
      )`,
    );
  }
  return conditions;
}

export async function findWorklogFullTextPage(input: {
  professionalProfileId: string;
  filters: WorklogArchiveFilters;
  scope?: EvidenceReadScope;
  cursor?: ArchiveCursorPosition;
}) {
  const conditions = archiveConditions(input);
  return prisma.$queryRaw<WorklogIdRow[]>(Prisma.sql`
    SELECT w."id", w."occurredAt"
    FROM icc."TerraqoWorklogEntry" w
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY w."occurredAt" DESC, w."id" DESC
    LIMIT ${input.filters.limit + 1}
  `);
}

export async function countWorklogFullText(input: {
  professionalProfileId: string;
  filters: WorklogArchiveFilters;
  scope?: EvidenceReadScope;
}) {
  const conditions = archiveConditions(input);
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM icc."TerraqoWorklogEntry" w
    WHERE ${Prisma.join(conditions, " AND ")}
  `);
  return Number(rows[0]?.count || 0n);
}

export async function findWorklogFullTextCalendar(input: {
  professionalProfileId: string;
  filters: WorklogArchiveFilters;
  scope?: EvidenceReadScope;
}) {
  const conditions = archiveConditions(input);
  return prisma.$queryRaw<Array<{ occurredAt: Date }>>(Prisma.sql`
    SELECT w."occurredAt"
    FROM icc."TerraqoWorklogEntry" w
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY w."occurredAt" ASC, w."id" ASC
  `);
}
