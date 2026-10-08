import "server-only";
import { EducationUploadBudget } from "./education-upload-budget";
import { EducationEvidenceReservationError } from "./education-evidence-reservation";
import { EducationPayloadError } from "./native-education-evidence-payload";
import type { uploadEducationEvidence } from "./education-evidence-upload";
import type { WorkspacePortalToken } from "./workspace-portal-session";

type Params = { workspaceSlug: string; educationId: string };
type Ports = {
  authenticate(request: Request, slug: string): Promise<WorkspacePortalToken | null>;
  upload(request: Request, token: WorkspacePortalToken, id: string, budget: EducationUploadBudget): ReturnType<typeof uploadEducationEvidence>;
};
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message: string, status: number) => Response.json({ error: { message } }, { status, headers });

/** Server-wired ports only. Body remains untouched until the shared revocable
 * Bearer authority has passed; reserve/commit repeat live authority under locks. */
export async function handleEducationUpload(request: Request, params: Params, ports: Ports) {
  const budget = new EducationUploadBudget(); // Includes authentication elapsed time.
  if (request.method !== "POST") { const response = fail("Método no permitido.", 405); response.headers.set("Allow", "GET, POST"); return response; }
  if (params.workspaceSlug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.workspaceSlug) ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(params.educationId)) return fail("Formación no disponible.", 404);
  if (new URL(request.url).search.length !== 0) return fail("Consulta no válida.", 422);
  try {
    const token = await ports.authenticate(request, params.workspaceSlug);
    if (!token || token.workspaceSlug !== params.workspaceSlug) return fail("La sesión no es válida.", 401);
    if (token.role !== "PROFESSIONAL" || !token.jti || token.exp <= Math.floor(Date.now() / 1000))
      return fail("Vuelve a iniciar tu sesión profesional.", 401);
    budget.beforeParse();
    const result = await ports.upload(request, token, params.educationId, budget);
    const receipt = result.receipt;
    // Receipt is historical confirmation, currentVersion is a separate snapshot.
    // Never expose internal ownership/storage/fingerprint/loser-attempt fields.
    return Response.json({ data: { receipt: { operationKey: receipt.operationKey, evidenceId: receipt.evidenceId,
      fileName: receipt.fileName, contentType: receipt.contentType, size: receipt.size,
      originalVersion: receipt.originalVersion.toISOString(), resultVersion: receipt.resultVersion.toISOString(),
      createdAt: receipt.createdAt.toISOString() }, currentVersion: result.currentVersion } }, { headers });
  } catch (error) {
    if (error instanceof EducationEvidenceReservationError || error instanceof EducationPayloadError)
      return fail(error.message, error.status);
    return fail("No pudimos confirmar el envío. Consulta su recibo antes de reenviar con la misma clave.", 503);
  }
}
