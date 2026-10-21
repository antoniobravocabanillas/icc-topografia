import { auth } from "@/auth";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { prisma } from "@/lib/prisma";
import { evidenceDetailDto } from "@/lib/terraqo/evidence-dto";
import {
  resolveEvidenceReadScope,
  scopeEvidenceWhere,
} from "@/lib/terraqo/evidence-policy";
import { worklogInclude } from "@/lib/terraqo/worklog";
import { reviseProfessionalWorklog, TerraqoWorklogError } from "@/lib/terraqo/worklog";
import { requireUser } from "@/lib/server/authz";
import { parseJson } from "@/lib/server/api";
import { terraqoWorklogRevisionSchema } from "@/lib/validations/terraqo";

type EvidenceDetailRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  { params }: EvidenceDetailRouteProps,
) {
  try {
    const [{ id }, session] = await Promise.all([params, auth()]);
    const recordIdentity = await prisma.terraqoWorklogEntry.findUnique({
      where: { id },
      select: { professionalProfileId: true },
    });
    if (!recordIdentity) return fail("Recurso no disponible.", 404);

    const scope = await resolveEvidenceReadScope({
      actorUserId: session?.user?.id,
      professionalProfileId: recordIdentity.professionalProfileId,
    });
    if (!scope) return fail("Recurso no disponible.", 404);

    const record = await prisma.terraqoWorklogEntry.findFirst({
      where: scopeEvidenceWhere(scope, { id }),
      include: worklogInclude,
    });
    if (!record) return fail("Recurso no disponible.", 404);

    return ok(
      {
        version: 1,
        audience: scope.audience,
        item: evidenceDetailDto(record, scope),
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
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: EvidenceDetailRouteProps,
) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const [{ id }, payload] = await Promise.all([
      params,
      parseJson(request, terraqoWorklogRevisionSchema),
    ]);
    return ok(await reviseProfessionalWorklog({
      userId: session.user.id,
      worklogId: id,
      payload,
    }));
  } catch (error) {
    if (error instanceof TerraqoWorklogError)
      return fail(error.message, error.status);
    return handleApiError(error);
  }
}
