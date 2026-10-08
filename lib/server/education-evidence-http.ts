import "server-only";
import { EducationEvidenceReservationError } from "./education-evidence-reservation";
import { PrivateEvidenceReadError } from "./private-evidence-stream";
import type { WorkspacePortalToken } from "./workspace-portal-session";
import type { readEducationEvidence } from "./education-evidence-read";

type Params = { workspaceSlug: string; educationId: string; evidenceId?: string };
type Ports = {
  authenticate(request: Request, slug: string): Promise<WorkspacePortalToken | null>;
  read(token: WorkspacePortalToken, educationId: string, operationKey?: string): ReturnType<typeof readEducationEvidence>;
  download(token: WorkspacePortalToken, educationId: string, evidenceId: string): Promise<Response>;
};
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message: string, status: number) => Response.json({ error: { message } }, { status, headers });
const id = (value: string) => /^[A-Za-z0-9_-]{1,100}$/.test(value);

/** Read-only boundary. Ports are wired by the server, never from request data;
 * all authority/reference checks remain inside the locked read services. */
export async function handleEducationEvidenceRead(request: Request, params: Params, ports: Ports) {
  if (request.method !== "GET") {
    const response = fail("Método no permitido.", 405); response.headers.set("Allow", "GET"); return response;
  }
  if (params.workspaceSlug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.workspaceSlug) ||
    !id(params.educationId) || (params.evidenceId !== undefined && !id(params.evidenceId)))
    return fail("Formación no disponible.", 404);
  const query = new URL(request.url).searchParams;
  if (new URL(request.url).search.length > 128 || (params.evidenceId !== undefined && query.size !== 0) ||
    [...query.keys()].some(key => key !== "operationKey") || query.getAll("operationKey").length > 1)
    return fail("Consulta no válida.", 422);
  const operationKey = query.get("operationKey") ?? undefined;
  if (operationKey !== undefined && !/^[a-f0-9]{32}$/.test(operationKey)) return fail("Clave de operación no válida.", 422);
  try {
    const token = await ports.authenticate(request, params.workspaceSlug);
    if (!token || token.workspaceSlug !== params.workspaceSlug) return fail("La sesión no es válida.", 401);
    // Legacy signed tokens cannot mint or extend a revocable grant via GET.
    if (token.role !== "PROFESSIONAL" || !token.jti) return fail("Vuelve a iniciar tu sesión profesional.", 401);
    if (params.evidenceId !== undefined) {
      const response = await ports.download(token, params.educationId, params.evidenceId);
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      return response;
    }
    return Response.json({ data: await ports.read(token, params.educationId, operationKey) }, { headers });
  } catch (error) {
    if (error instanceof EducationEvidenceReservationError || error instanceof PrivateEvidenceReadError)
      return fail(error.message, error.status);
    // Neither Prisma errors nor provider request objects enter logs/responses.
    return fail("No pudimos consultar la formación. Inténtalo nuevamente.", 503);
  }
}
