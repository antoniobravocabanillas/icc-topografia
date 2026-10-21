import { fail, handleApiError, ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { prisma } from "@/lib/prisma";
import { getWorklogArchivePage } from "@/lib/terraqo/worklog-archive";
import {
  parseWorklogArchiveFilters,
  WorklogArchiveError,
} from "@/lib/terraqo/worklog-archive-contract";

export async function GET(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const url = new URL(request.url);
    const filters = parseWorklogArchiveFilters({
      q: url.searchParams.get("q") || undefined,
      tipo: url.searchParams.get("tipo") || undefined,
      proyecto: url.searchParams.get("proyecto") || undefined,
      estado: url.searchParams.get("estado") || undefined,
      fecha: url.searchParams.get("fecha") || undefined,
      desde: url.searchParams.get("desde") || undefined,
      hasta: url.searchParams.get("hasta") || undefined,
      mes: url.searchParams.get("mes") || undefined,
      tz: url.searchParams.get("tz") || undefined,
      limite: url.searchParams.get("limite") || undefined,
    });
    const profile = await prisma.terraqoProfessionalProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!profile) {
      return fail("Completa tu perfil profesional para consultar el archivo.", 409);
    }

    const page = await getWorklogArchivePage({
      professionalProfileId: profile.id,
      filters,
      cursor: url.searchParams.get("cursor") || undefined,
    });
    return ok(
      {
        version: 1,
        filters: {
          query: filters.query || null,
          type: filters.type || null,
          projectId: filters.projectId || null,
          evidenceStatus: filters.evidenceStatus || null,
          date: filters.date || null,
          from: filters.from || null,
          to: filters.to || null,
          month: filters.month,
          timeZone: filters.timeZone,
          limit: filters.limit,
        },
        items: page.items.map((worklog) => ({
          id: worklog.id,
          title: worklog.title,
          summary: worklog.summary,
          outcome: worklog.outcome,
          type: worklog.type,
          evidenceStatus: worklog.evidenceStatus,
          visibility: worklog.visibility,
          occurredAt: worklog.occurredAt.toISOString(),
          locationLabel: worklog.locationLabel,
          skills: worklog.skills,
          project: worklog.project,
          workspace: worklog.workspace,
          evidenceCount: worklog.media.length + worklog.evidenceUrls.length,
          engagement: {
            comments: worklog._count.comments,
            reactions: worklog._count.reactions,
          },
        })),
        page: {
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        },
      },
    );
  } catch (error) {
    if (error instanceof WorklogArchiveError) {
      return fail(error.message, 400);
    }
    return handleApiError(error);
  }
}
