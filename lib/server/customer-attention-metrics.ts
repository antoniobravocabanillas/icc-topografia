import type { PrismaClient } from "@prisma/client";

/** One row per opportunity/sale, even when several conversations contributed. No contact or message text is selected. */
export async function attentionMetrics(db: PrismaClient, workspaceId: string, days: number, now = new Date()) {
  if (![7, 30, 90].includes(days)) throw new Error("Período no admitido");
  const since = new Date(now.getTime() - days * 86400000);
  return db.$transaction(async tx => {
    // Prisma stores these timestamp columns as UTC; raw parameters must not inherit the session zone.
    const [counts] = await tx.$queryRaw<{ total: number; answered: number; resolved: number; linked: number; averageMinutes: number | null }[]>`
      WITH cohort AS (
        SELECT c.id, c.status, c."createdAt", (SELECT min(m."createdAt") FROM icc."ChatMessage" m WHERE m."conversationId" = c.id AND m.sender = 'admin' AND m."createdAt" <= (${now}::timestamptz AT TIME ZONE 'UTC')) AS first_reply
        FROM icc."ChatConversation" c WHERE c."terraqoWorkspaceId" = ${workspaceId} AND c."createdAt" >= (${since}::timestamptz AT TIME ZONE 'UTC') AND c."createdAt" <= (${now}::timestamptz AT TIME ZONE 'UTC')
      ) SELECT count(*)::int AS total, count(first_reply)::int AS answered,
        count(*) FILTER (WHERE status = 'CLOSED')::int AS resolved,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM icc."ActivityLog" a JOIN icc."Opportunity" o ON o.id = a."opportunityId" AND o."terraqoWorkspaceId" = ${workspaceId} AND o."deletedAt" IS NULL WHERE a."terraqoWorkspaceId" = ${workspaceId} AND a."entityType" = 'ChatConversation' AND a."entityId" = cohort.id AND a.action = 'CONVERTED'))::int AS linked,
        avg(greatest(0, extract(epoch FROM (first_reply - "createdAt")) / 60)) FILTER (WHERE first_reply IS NOT NULL)::float AS "averageMinutes"
      FROM cohort`;
    const opportunities = await tx.$queryRaw<{ status: string; count: number }[]>`
      SELECT o.status::text AS status, count(*)::int AS count FROM icc."Opportunity" o
      WHERE o."terraqoWorkspaceId" = ${workspaceId} AND o."deletedAt" IS NULL AND EXISTS (
        SELECT 1 FROM icc."ActivityLog" a JOIN icc."ChatConversation" c ON c.id = a."entityId" AND c."terraqoWorkspaceId" = ${workspaceId}
        WHERE a."terraqoWorkspaceId" = ${workspaceId} AND a."entityType" = 'ChatConversation' AND a.action = 'CONVERTED' AND a."opportunityId" = o.id AND c."createdAt" >= (${since}::timestamptz AT TIME ZONE 'UTC') AND c."createdAt" <= (${now}::timestamptz AT TIME ZONE 'UTC')
      ) GROUP BY o.status`;
    const sales = await tx.$queryRaw<{ status: string; currency: string; count: number; amount: string }[]>`
      SELECT s.status::text AS status, s.currency, count(*)::int AS count, trim_scale(sum(s.amount))::text AS amount FROM icc."Sale" s
      JOIN icc."Opportunity" o ON o.id = s."opportunityId" AND o."terraqoWorkspaceId" = ${workspaceId} AND o."deletedAt" IS NULL
      WHERE s."terraqoWorkspaceId" = ${workspaceId} AND s."deletedAt" IS NULL AND EXISTS (
        SELECT 1 FROM icc."ActivityLog" a JOIN icc."ChatConversation" c ON c.id = a."entityId" AND c."terraqoWorkspaceId" = ${workspaceId}
        WHERE a."terraqoWorkspaceId" = ${workspaceId} AND a."entityType" = 'ChatConversation' AND a.action = 'CONVERTED' AND a."opportunityId" = s."opportunityId" AND c."createdAt" >= (${since}::timestamptz AT TIME ZONE 'UTC') AND c."createdAt" <= (${now}::timestamptz AT TIME ZONE 'UTC')
      ) GROUP BY s.status, s.currency ORDER BY s.currency, s.status`;
    const overdue = await tx.chatConversation.count({ where: { terraqoWorkspaceId: workspaceId, status: { not: "CLOSED" }, nextActionAt: { lt: now }, nextActionCompletedAt: null } });
    return { since, until: now, counts, opportunities, sales, overdue };
  }, { isolationLevel: "RepeatableRead" });
}
