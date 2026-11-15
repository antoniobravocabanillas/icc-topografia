import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { worklogInclude } from "@/lib/terraqo/worklog";
import type { EvidenceReadScope } from "@/lib/terraqo/evidence-policy";
import {
  countWorklogFullText,
  countArchiveDays,
  findWorklogFullTextPage,
  isWorklogFullTextEnabled,
} from "@/lib/terraqo/worklog-full-text";
import {
  buildWorklogArchiveWhere,
  decodeWorklogArchiveCursor,
  encodeWorklogArchiveCursor,
  type WorklogArchiveFilters,
} from "@/lib/terraqo/worklog-archive-contract";

export async function getWorklogArchivePage(input: {
  professionalProfileId: string;
  filters: WorklogArchiveFilters;
  cursor?: string;
  scopeWhere?: Prisma.TerraqoWorklogEntryWhereInput;
  scope?: EvidenceReadScope;
}) {
  const archiveWhere = buildWorklogArchiveWhere(
    input.professionalProfileId,
    input.filters,
  );
  const baseWhere = input.scopeWhere
    ? { AND: [input.scopeWhere, archiveWhere] }
    : archiveWhere;
  const cursor = input.cursor
    ? decodeWorklogArchiveCursor(input.cursor, input.filters)
    : undefined;
  if (input.filters.query && isWorklogFullTextEnabled()) {
    const matches = await findWorklogFullTextPage({
      professionalProfileId: input.professionalProfileId,
      filters: input.filters,
      scope: input.scope,
      cursor,
    });
    const hasMore = matches.length > input.filters.limit;
    const pageMatches = matches.slice(0, input.filters.limit);
    const ids = pageMatches.map((match) => match.id);
    const hydrateArchiveWhere = buildWorklogArchiveWhere(
      input.professionalProfileId,
      { ...input.filters, query: undefined },
    );
    const hydrateWhere: Prisma.TerraqoWorklogEntryWhereInput = input.scopeWhere
      ? { AND: [input.scopeWhere, hydrateArchiveWhere, { id: { in: ids } }] }
      : { AND: [hydrateArchiveWhere, { id: { in: ids } }] };
    const hydrated = ids.length
      ? await prisma.terraqoWorklogEntry.findMany({
          // Reapply the visibility policy while hydrating. A record that became
          // private between the FTS lookup and this read must never leak.
          where: hydrateWhere,
          include: worklogInclude,
        })
      : [];
    const byId = new Map(hydrated.map((record) => [record.id, record]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((record): record is NonNullable<typeof record> => Boolean(record));
    const last = pageMatches.at(-1);
    return {
      items,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeWorklogArchiveCursor(last.occurredAt, last.id, input.filters)
          : null,
    };
  }
  const where: Prisma.TerraqoWorklogEntryWhereInput = cursor
    ? {
        AND: [
          baseWhere,
          {
            OR: [
              { occurredAt: { lt: cursor.occurredAt } },
              { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
            ],
          },
        ],
      }
    : baseWhere;
  const records = await prisma.terraqoWorklogEntry.findMany({
    where,
    include: worklogInclude,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: input.filters.limit + 1,
  });
  const hasMore = records.length > input.filters.limit;
  const items = records.slice(0, input.filters.limit);
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeWorklogArchiveCursor(last.occurredAt, last.id, input.filters)
        : null,
  };
}

export function getWorklogArchiveCalendar(input: {
  professionalProfileId: string;
  filters: WorklogArchiveFilters;
  scope?: EvidenceReadScope;
  recordId?: string;
}) {
  return countArchiveDays({ ...input, filters: {
    ...input.filters, date: undefined, from: undefined, to: undefined, allTime: false,
  } });
}

export async function countWorklogArchive(input: {
  professionalProfileId: string;
  filters: WorklogArchiveFilters;
  scopeWhere?: Prisma.TerraqoWorklogEntryWhereInput;
  scope?: EvidenceReadScope;
}) {
  if (input.filters.query && isWorklogFullTextEnabled()) {
    return countWorklogFullText({
      professionalProfileId: input.professionalProfileId,
      filters: input.filters,
      scope: input.scope,
    });
  }
  const archiveWhere = buildWorklogArchiveWhere(
    input.professionalProfileId,
    input.filters,
  );
  return prisma.terraqoWorklogEntry.count({
    where: input.scopeWhere
      ? { AND: [input.scopeWhere, archiveWhere] }
      : archiveWhere,
  });
}

// Facets use the same authorized record scope; no private project inventory is exposed.
export async function getWorklogArchiveProjects(scope: EvidenceReadScope) {
  return prisma.project.findMany({
    where: { terraqoWorklogs: { some: scope.where } },
    select: { id: true, title: true }, orderBy: [{ title: "asc" }, { id: "asc" }],
  });
}
