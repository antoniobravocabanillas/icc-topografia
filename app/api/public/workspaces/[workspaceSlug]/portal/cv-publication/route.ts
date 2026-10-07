import { ZodError } from "zod";
import { fail, ok } from "@/lib/server/api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { CvPublicationError, readCvPublication, writeCvPublication } from "@/lib/server/portal-cv-publication";

import { boundedJson, privateResponse } from "@/lib/server/cv-publication-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ workspaceSlug: string }> };
async function handle(request: Request, context: Context, write: boolean) {
  try {
    const { workspaceSlug } = await context.params;
    const token = await getWorkspacePortalToken(request, workspaceSlug);
    if (!token) return privateResponse(fail("La sesión no es válida.", 401));
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => key !== "operationKey") || query.getAll("operationKey").length > 1 || (write && query.size))
      throw new CvPublicationError("Consulta no válida.", 422);
    const result = write ? await writeCvPublication(token, await boundedJson(request))
      : await readCvPublication(token, query.has("operationKey") ? query.get("operationKey")! : undefined);
    return privateResponse(ok(result));
  } catch (error) {
    if (error instanceof CvPublicationError) return privateResponse(fail(error.message, error.status));
    if (error instanceof ZodError)
      return privateResponse(fail("Solicitud no válida.", 422));
    return privateResponse(fail("No pudimos confirmar el resultado. Consulta la operación antes de repetirla.", 500));
  }
}
export const GET = (request: Request, context: Context) => handle(request, context, false);
export const POST = (request: Request, context: Context) => handle(request, context, true);
