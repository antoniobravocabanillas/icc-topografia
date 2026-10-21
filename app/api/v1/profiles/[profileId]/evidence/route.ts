import { auth } from "@/auth";
import { fail, handleApiError, ok } from "@/lib/server/api";
import {
  countWorklogArchive,
  getWorklogArchivePage,
} from "@/lib/terraqo/worklog-archive";
import {
  parseWorklogArchiveFilters,
  WorklogArchiveError,
} from "@/lib/terraqo/worklog-archive-contract";
import { evidenceListDto } from "@/lib/terraqo/evidence-dto";
import { resolveEvidenceReadScope } from "@/lib/terraqo/evidence-policy";

type EvidenceArchiveRouteProps = {
  params: Promise<{ profileId: string }>;
};

export async function GET(
  request: Request,
  { params }: EvidenceArchiveRouteProps,
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
      fecha: url.searchParams.get("date") || undefined,
      desde: url.searchParams.get("from") || undefined,
      hasta: url.searchParams.get("to") || undefined,
      mes: url.searchParams.get("month") || undefined,
      tz: url.searchParams.get("timezone") || undefined,
      limite: url.searchParams.get("limit") || undefined,
      alcance: url.searchParams.get("period") || undefined,
    });
    const requestScope = {
      professionalProfileId: profileId,
      filters,
      scopeWhere: scope.where,
      scope,
    };
    const [page, total] = await Promise.all([
      getWorklogArchivePage({
        ...requestScope,
        cursor: url.searchParams.get("cursor") || undefined,
      }),
      countWorklogArchive(requestScope),
    ]);

    return ok(
      {
        version: 1,
        audience: scope.audience,
        items: page.items.map((item) => evidenceListDto(item, scope)),
        page: {
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          limit: filters.limit,
        },
        scopeCounts: {
          records: total,
        },
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
