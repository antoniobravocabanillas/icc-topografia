import { fail, handleApiError, ok } from "@/lib/server/api";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { listPortalResource, savePortalResource, resourceCodes, PortalResourceError, type ResourceCode } from "@/lib/server/portal-resources";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { PortalCvError } from "@/lib/server/portal-cv-entries";
import { PortalProjectWriteError } from "@/lib/server/portal-project-write";
import { PortalTaskCreateError } from "@/lib/server/portal-task-create";

type Context = { params: Promise<{ workspaceSlug: string; resource: string }> };
const command = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(), version: z.string().optional(), fields: z.record(z.string(), z.string()) }).strict();
const cache = { headers: { "Cache-Control": "private, no-store" } };
async function handle(request: Request, context: Context, write: boolean) {
  try {
    const { workspaceSlug, resource } = await context.params;
    const token = await getWorkspacePortalToken(request, workspaceSlug);
    if (!token) return fail("La sesión no es válida.", 401);
    if (!resourceCodes.includes(resource as ResourceCode)) return fail("Sección no disponible.", 404);
    if (!write) {
      const cursor = new URL(request.url).searchParams.get("cursor") || undefined;
      if (cursor && !/^[a-zA-Z0-9_-]{1,100}$/.test(cursor)) return fail("Página no válida.", 422);
      return ok(await listPortalResource(token, resource as ResourceCode, cursor), cache);
    }
    // Bound the decoded input before validation. This endpoint accepts JSON only;
    // binary uploads have a separate contract and storage policy.
    if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("Formato no válido.", 415);
    const reader = request.body?.getReader();
    if (!reader) return fail("Datos requeridos.", 422);
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > 100000) { await reader.cancel(); return fail("Contenido demasiado grande.", 413); } chunks.push(value); } }
    finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return fail("JSON no válido.", 422); }
    const payload = command.parse(body);
    const record = await savePortalResource(token, resource as ResourceCode, payload.fields,
      request.headers.get("Idempotency-Key"), payload.id, payload.version);
    if (["profile", "experiences", "education"].includes(resource)) {
      revalidatePath("/portal");
      revalidatePath("/portal/perfil");
      revalidatePath("/cv/[username]", "page");
      revalidatePath("/red");
      revalidatePath("/portal/experiencias");
      revalidatePath("/cv/[username]/experiencias", "page");
      revalidatePath("/cv/[username]/experiencias/[experienceId]", "page");
    }
    return ok({ schemaVersion: 1, workspaceSlug, resource, record }, cache);
  } catch (error) { if (error instanceof PortalResourceError || error instanceof PortalCvError || error instanceof PortalTaskCreateError || error instanceof PortalProjectWriteError) return fail(error.message, error.status); return handleApiError(error); }
}
export function GET(request: Request, context: Context) { return handle(request, context, false); }
export function POST(request: Request, context: Context) { return handle(request, context, true); }
