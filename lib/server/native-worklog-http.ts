import "server-only";
import type { WorkspacePortalToken } from "./workspace-portal-session";
import { parseNativeWorklogPayload, NativeWorklogPayloadError } from "./native-worklog-payload";

export class NativeWorklogOperationError extends Error {
  constructor(readonly status: 401 | 403 | 404 | 409 | 429 | 503) { super("Operación de bitácora no confirmada."); }
}
export type NativeWorklogOperationResult = {
  receipt: null | { operationKey: string; worklogId: string; createdAt: Date; originalProjectVersion: string | null };
  current: null | { worklogId: string; version: string };
};
type Parsed = Awaited<ReturnType<typeof parseNativeWorklogPayload>>;
type Ports = {
  authenticate(request: Request, slug: string): Promise<WorkspacePortalToken | null>;
  // Future SQL core must revalidate grant/role/member/modules/project and expiry under locks.
  create(input: Parsed, token: WorkspacePortalToken): Promise<NativeWorklogOperationResult>;
  read(token: WorkspacePortalToken, operationKey: string): Promise<NativeWorklogOperationResult>;
};
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number) => Response.json({error:{message:status === 401 ? "Vuelve a iniciar tu sesión profesional." :
  status === 503 ? "No pudimos confirmar la operación. Consulta el recibo antes de reenviar la solicitud original." : "Solicitud de bitácora no disponible."}}, {status,headers:privateHeaders});
function projectResult(result: NativeWorklogOperationResult) {
  return { receipt: result.receipt ? {
    operationKey: result.receipt.operationKey, worklogId: result.receipt.worklogId, outcome: "CREATED",
    createdAt: result.receipt.createdAt.toISOString(), originalProjectVersion: result.receipt.originalProjectVersion,
  } : null, current: result.current ? {worklogId:result.current.worklogId,version:result.current.version} : null };
}

/** Preparatory boundary only: no route or SQL/adjudication implementation is wired.
 * Server supplies ports; clients cannot supply an actor, workspace, digest or dependency.
 * Receipt confirms historical creation, not current publication or points settlement. */
export async function handleNativeWorklogOperation(request: Request, workspaceSlug: string, ports: Ports) {
  if (!["GET","POST"].includes(request.method)) { const response=fail(405); response.headers.set("Allow","GET, POST"); return response; }
  if (workspaceSlug.length>100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workspaceSlug)) return fail(404);
  const url=new URL(request.url); let key="";
  if (request.method === "GET") {
    key=url.searchParams.get("operationKey") ?? "";
    if (url.search.length>128 || !/^[a-f0-9]{32}$/.test(key) || [...url.searchParams.keys()].some(k=>k!=="operationKey") || url.searchParams.getAll("operationKey").length!==1) return fail(422);
  } else if (url.search.length) return fail(422);
  try {
    const token=await ports.authenticate(request,workspaceSlug);
    if (!token || token.workspaceSlug!==workspaceSlug || token.role!=="PROFESSIONAL" || !token.jti ||
      !Number.isFinite(token.exp) || token.exp<=Math.floor(Date.now()/1000)) return fail(401);
    if (request.method === "GET") {
      const result=await ports.read(token,key);
      if (result.receipt && result.receipt.operationKey!==key) return fail(503);
      return Response.json({data:projectResult(result)},{headers:privateHeaders});
    }
    // No Request.body access, parse, or create port call before live shared authentication.
    const parsed=await parseNativeWorklogPayload(request);
    const result=await ports.create(parsed,token);
    if (!result.receipt || result.receipt.operationKey!==parsed.payload.operationKey) return fail(503);
    return Response.json({data:projectResult(result)},{headers:privateHeaders});
  } catch (error) {
    return fail(error instanceof NativeWorklogPayloadError || error instanceof NativeWorklogOperationError ? error.status : 503);
  }
}
