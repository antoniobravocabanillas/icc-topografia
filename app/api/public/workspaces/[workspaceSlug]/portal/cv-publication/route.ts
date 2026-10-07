import { ZodError } from "zod";
import { fail, ok } from "@/lib/server/api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { CvPublicationError, readCvPublication, writeCvPublication } from "@/lib/server/portal-cv-publication";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ workspaceSlug: string }> };
function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
async function boundedJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new CvPublicationError("Se requiere JSON.", 415);
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 4096)) throw new CvPublicationError("Solicitud demasiado grande.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new CvPublicationError("Solicitud no válida.", 422);
  let total = 0;
  const chunks: Uint8Array[] = [];
  const deadline = Date.now() + 10000;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new CvPublicationError("La solicitud tardó demasiado.", 408);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([reader.read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CvPublicationError("La solicitud tardó demasiado.", 408)), remaining);
      })]).finally(() => { if (timer) clearTimeout(timer); });
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > 4096) throw new CvPublicationError("Solicitud demasiado grande.", 413);
      chunks.push(chunk.value);
    }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new CvPublicationError("JSON no válido.", 422); }
  } finally { await reader.cancel().catch(() => undefined); }
}
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
