import "server-only";
import { EducationEvidenceReservationError } from "./education-evidence-reservation";
import { parseEducationWithdrawal } from "./education-withdrawal-payload";
import { educationWithdrawalReceipt, type readEducationWithdrawal } from "./education-withdrawal-read";
import type { withdrawEducationEvidence } from "./education-evidence-withdrawal";
import type { WorkspacePortalToken } from "./workspace-portal-session";

type Params = { workspaceSlug: string; educationId: string; evidenceId?: string };
type Ports = {
  authenticate(request: Request, slug: string): Promise<WorkspacePortalToken | null>;
  read(token: WorkspacePortalToken, id: string, key: string): ReturnType<typeof readEducationWithdrawal>;
  withdraw(token: WorkspacePortalToken, id: string, payload: { evidenceId: string; version: string; operationKey: string }): ReturnType<typeof withdrawEducationEvidence>;
};
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message: string, status: number) => Response.json({ error: { message } }, { status, headers });
export async function handleEducationWithdrawal(request: Request, params: Params, ports: Ports) {
  const write = params.evidenceId !== undefined, method = write ? "POST" : "GET";
  if (request.method !== method) { const response = fail("Método no permitido.", 405); response.headers.set("Allow", method); return response; }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.workspaceSlug) || params.workspaceSlug.length > 100 ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(params.educationId) || (write && !/^[A-Za-z0-9_-]{1,100}$/.test(params.evidenceId!)))
    return fail("Formación no disponible.", 404);
  const url = new URL(request.url), query = url.searchParams;
  if (url.search.length > 128 || (write ? query.size !== 0 : query.size !== 1 || query.getAll("operationKey").length !== 1 ||
    !/^[a-f0-9]{32}$/.test(query.get("operationKey") ?? ""))) return fail("Consulta no válida.", 422);
  try {
    // Bearer-only shared authentication validates membership and revocable
    // grant BEFORE body consumption. Service repeats locked live authority.
    const token = await ports.authenticate(request, params.workspaceSlug);
    if (!token || token.workspaceSlug !== params.workspaceSlug) return fail("La sesión no es válida.", 401);
    if (token.role !== "PROFESSIONAL" || !token.jti) return fail("Vuelve a iniciar tu sesión profesional.", 401);
    if (!write) return Response.json({ data: await ports.read(token, params.educationId, query.get("operationKey")!) }, { headers });
    const payload = await parseEducationWithdrawal(request);
    const result = await ports.withdraw(token, params.educationId, { ...payload, evidenceId: params.evidenceId! });
    // No provider I/O after this durable commit: operational recovery already
    // consumes the pending fence. Response does not assert physical deletion.
    return Response.json({ data: { receipt: educationWithdrawalReceipt(result.receipt), currentVersion: result.currentVersion } }, { headers });
  } catch (error) {
    if (error instanceof EducationEvidenceReservationError) return fail(error.message, error.status);
    return fail("No pudimos confirmar la retirada. Consulta su recibo antes de reenviar.", 503);
  }
}
