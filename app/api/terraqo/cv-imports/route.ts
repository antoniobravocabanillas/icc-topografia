import { requireUser } from "@/lib/server/authz";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { CvImportError, startCvImport } from "@/lib/server/cv-import";
import { cvImportStartSchema } from "@/lib/terraqo/cv-import-schema";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const input = await parseJson(request, cvImportStartSchema);
    return ok(await startCvImport(session.user.id, input.documentId, input.consentForTraining));
  } catch (error) {
    if (error instanceof CvImportError) return fail(error.message, error.status, { code: error.code });
    return handleApiError(error);
  }
}
