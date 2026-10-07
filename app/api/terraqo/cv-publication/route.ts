import { ZodError } from "zod";
import { fail, ok } from "@/lib/server/api";
import { terraqoDomains } from "@/lib/terraqo-domains";
import { boundedJson, privateResponse } from "@/lib/server/cv-publication-http";
import { CvPublicationError, readCvPublication, writeCvPublication } from "@/lib/server/portal-cv-publication";
import { webCvPublicationIdentity } from "@/lib/server/web-cv-publication-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function originGuard(request: Request, write: boolean) {
  const trusted = new URL(terraqoDomains.portal).origin;
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if ((origin !== null && origin !== trusted) || (site !== null && site !== "same-origin" && site !== "none") ||
      (write && (origin !== trusted || request.headers.get("x-terraqo-cv-command") !== "1")))
    throw new CvPublicationError("La solicitud debe realizarse desde tu portal.", 403);
}

async function handle(request: Request, write: boolean) {
  try {
    originGuard(request, write);
    const query = new URL(request.url).searchParams;
    const workspaceSlug = query.get("workspaceSlug");
    if (!workspaceSlug || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(workspaceSlug) || query.getAll("workspaceSlug").length !== 1 ||
        [...query.keys()].some(key => key !== "workspaceSlug" && key !== "operationKey") ||
        query.getAll("operationKey").length > 1 || (write && query.has("operationKey")))
      throw new CvPublicationError("Consulta no válida.", 422);
    const identity = await webCvPublicationIdentity(request, workspaceSlug);
    const result = write ? await writeCvPublication(identity, await boundedJson(request))
      : await readCvPublication(identity, query.has("operationKey") ? query.get("operationKey")! : undefined);
    return privateResponse(ok(result));
  } catch (error) {
    if (error instanceof CvPublicationError) return privateResponse(fail(error.message, error.status));
    if (error instanceof ZodError) return privateResponse(fail("Solicitud no válida.", 422));
    return privateResponse(fail("No pudimos confirmar el resultado. Consulta la operación antes de repetirla.", 500));
  }
}
export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
