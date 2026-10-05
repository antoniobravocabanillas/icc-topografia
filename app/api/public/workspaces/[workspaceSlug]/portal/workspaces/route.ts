import { z } from "zod";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { listPortalWorkspaces, switchPortalWorkspace, WorkspaceSwitchError } from "@/lib/server/portal-workspaces";

type Context = { params: Promise<{ workspaceSlug: string }> };
const command = z.object({ workspaceSlug: z.string().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }).strict();
const cache = { headers: { "Cache-Control": "private, no-store" } };
async function handle(request: Request, context: Context, write: boolean) {
  try {
    const { workspaceSlug } = await context.params;
    const token = await getWorkspacePortalToken(request, workspaceSlug);
    if (!token) return fail("La sesión no es válida.", 401);
    if (!write) {
      const cursor = new URL(request.url).searchParams.get("cursor") || undefined;
      if (cursor && !/^[a-zA-Z0-9_-]{1,100}$/.test(cursor)) return fail("Página no válida.", 422);
      return ok(await listPortalWorkspaces(token, cursor), cache);
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("Formato no válido.", 415);
    const reader = request.body?.getReader();
    if (!reader) return fail("Datos requeridos.", 422);
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 1024) { await reader.cancel(); return fail("Contenido demasiado grande.", 413); }
      chunks.push(value);
    } } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return fail("JSON no válido.", 422); }
    const payload = command.parse(body);
    return ok(await switchPortalWorkspace(token, payload.workspaceSlug), cache);
  } catch (error) {
    if (error instanceof WorkspaceSwitchError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
export function GET(request: Request, context: Context) { return handle(request, context, false); }
export function POST(request: Request, context: Context) { return handle(request, context, true); }
