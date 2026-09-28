import { requireUser } from "@/lib/server/authz";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { CvImportError, dispatchCvImport, failCvImportDispatch, queueCvImport } from "@/lib/server/cv-import";
import { cvImportStartSchema } from "@/lib/terraqo/cv-import-schema";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const input = await parseJson(request, cvImportStartSchema);
    const queued = await queueCvImport(session.user.id, input.documentId, input.consentForTraining);
    if (queued.shouldDispatch) {
      try {
        await dispatchCvImport(queued.record.id);
      } catch (error) {
        await failCvImportDispatch(queued.record.id, error);
        throw error;
      }
    }
    return ok(queued.record, { status: queued.shouldDispatch ? 202 : 200 });
  } catch (error) {
    if (error instanceof CvImportError) return fail(error.message, error.status, { code: error.code });
    return handleApiError(error);
  }
}
