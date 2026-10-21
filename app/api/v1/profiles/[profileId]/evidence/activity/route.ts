import { auth } from "@/auth";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { getWorklogArchiveCalendar } from "@/lib/terraqo/worklog-archive";
import {
  parseWorklogArchiveFilters,
  WorklogArchiveError,
} from "@/lib/terraqo/worklog-archive-contract";
import { resolveEvidenceReadScope } from "@/lib/terraqo/evidence-policy";

type EvidenceActivityRouteProps = {
  params: Promise<{ profileId: string }>;
};

export async function GET(
  request: Request,
  { params }: EvidenceActivityRouteProps,
) {
  try {
    const [{ profileId }, session] = await Promise.all([params, auth()]);
    const scope = await resolveEvidenceReadScope({
      actorUserId: session?.user?.id,
      professionalProfileId: profileId,
    });
    if (!scope) return fail("Recurso no disponible.", 404);

    const url = new URL(request.url);
    const filters = parseWorklogArchiveFilters({
      q: url.searchParams.get("q") || undefined,
      tipo: url.searchParams.get("type") || undefined,
      proyecto:
        url.searchParams.get("projectId") ||
        url.searchParams.get("workCaseId") ||
        undefined,
      estado: url.searchParams.get("state") || undefined,
      mes: url.searchParams.get("month") || undefined,
      tz: url.searchParams.get("timezone") || undefined,
    });
    const counts = await getWorklogArchiveCalendar({
      professionalProfileId: profileId,
      filters,
      scopeWhere: scope.where,
      scope,
    });
    return ok(
      {
        version: 1,
        audience: scope.audience,
        month: filters.month,
        timeZone: filters.timeZone,
        days: [...counts.entries()].map(([date, count]) => ({ date, count })),
      },
      {
        headers: {
          "Cache-Control":
            scope.audience === "PUBLIC"
              ? "public, max-age=30, stale-while-revalidate=60"
              : "private, no-store",
          Vary: "Cookie",
        },
      },
    );
  } catch (error) {
    if (error instanceof WorklogArchiveError) return fail(error.message, 400);
    return handleApiError(error);
  }
}
