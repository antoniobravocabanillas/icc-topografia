import { requireUser } from "@/lib/server/authz";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { applyCvImport, CvImportError } from "@/lib/server/cv-import";

type RouteProps = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: RouteProps) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    return ok(await applyCvImport(session.user.id, (await params).id));
  } catch (error) {
    if (error instanceof CvImportError) return fail(error.message, error.status, { code: error.code });
    return handleApiError(error);
  }
}
