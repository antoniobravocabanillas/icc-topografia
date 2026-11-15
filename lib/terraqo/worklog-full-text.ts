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
  const published = Prisma.sql`(
      w."visibility"::text = 'PUBLIC' AND w."lifecycle"::text = 'PUBLISHED' AND w."workspaceId" IS NULL
      AND (w."projectId" IS NULL OR EXISTS (SELECT 1 FROM icc."Project" j
        WHERE j.id = w."projectId" AND j."isPublic" AND j."deletedAt" IS NULL))
      AND EXISTS (SELECT 1 FROM icc."TerraqoProfessionalProfile" p
        WHERE p.id = w."professionalProfileId" AND p."liveCvEnabled")
    )`;
  if (scope.audience === "PUBLIC") return published;

  const alternatives: Prisma.Sql[] = [
    Prisma.sql`w."visibility"::text = 'COMMUNITY'`,
  ];
  if (scope.profile.liveCvEnabled) {
    alternatives.push(published);
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

// Prisma DateTime columns are UTC timestamps without time zone. Bind that same
// type so PostgreSQL does not shift date bounds or cursors to its session zone.
function utcTimestamp(instant: Date) {
  return Prisma.sql`${instant.toISOString().slice(0, -1)}::timestamp`;
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
  ];
  if (filters.query) {
    const pattern = "%" + filters.query + "%";
    conditions.push(isWorklogFullTextEnabled()
      ? Prisma.sql`w."searchVector" @@ websearch_to_tsquery('spanish'::regconfig, ${filters.query})`
      : Prisma.sql`(w."title" ILIKE ${pattern} OR w."summary" ILIKE ${pattern} OR w."outcome" ILIKE ${pattern})`);
  }
  const period = worklogArchivePeriod(filters);
  if (period?.gte) conditions.push(Prisma.sql`w."occurredAt" >= ${utcTimestamp(period.gte)}`);
  if (period?.lt) conditions.push(Prisma.sql`w."occurredAt" < ${utcTimestamp(period.lt)}`);
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
        w."occurredAt" < ${utcTimestamp(input.cursor.occurredAt)}
        OR (w."occurredAt" = ${utcTimestamp(input.cursor.occurredAt)} AND w."id" < ${input.cursor.id})
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

// Prisma stores occurredAt as a UTC timestamp without time zone. Convert before
// grouping so a record after midnight UTC still belongs to the local workday.
export async function countArchiveDays(input: {
  professionalProfileId: string;
  filters: WorklogArchiveFilters;
  scope?: EvidenceReadScope;
  recordId?: string;
}) {
  const { filters, recordId } = input;
  const conditions = archiveConditions(input);
  if (recordId) conditions.push(Prisma.sql`w.id = ${recordId}`);
  const rows = await prisma.$queryRaw<Array<{ day: string; count: bigint }>>(Prisma.sql`
    SELECT to_char((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${filters.timeZone}, 'YYYY-MM-DD') AS day,
           count(*) AS count
    FROM icc."TerraqoWorklogEntry" w
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY 1 ORDER BY 1
  `);
  return new Map(rows.map(row => [row.day, Number(row.count)]));
}
