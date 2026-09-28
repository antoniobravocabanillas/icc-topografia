import { requireUser } from "@/lib/server/authz";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { CvImportError, getCvImport, reviewCvImport } from "@/lib/server/cv-import";
import { cvImportReviewSchema } from "@/lib/terraqo/cv-import-schema";

type RouteProps = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: RouteProps) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    return ok(await getCvImport(session.user.id, (await params).id));
  } catch (error) {
    if (error instanceof CvImportError) return fail(error.message, error.status, { code: error.code });
    return handleApiError(error);
  }
}
export async function PATCH(request: Request, { params }: RouteProps) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const input = await parseJson(request, cvImportReviewSchema);
    return ok(await reviewCvImport(session.user.id, (await params).id, input));
  } catch (error) {
    if (error instanceof CvImportError) return fail(error.message, error.status, { code: error.code });
    return handleApiError(error);
  }
}
