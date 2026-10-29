import { requireUser } from "@/lib/server/authz";
import { createExperienceEvidenceUpload, ExperienceEvidenceUploadError, finalizeExperienceEvidenceUpload } from "@/lib/server/experience-evidence-upload";
import { handleApiError, ok } from "@/lib/server/api";

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 32 * 1024) return Response.json({ error: "La solicitud supera el límite permitido." }, { status: 413 });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "El formato de la solicitud no es válido." }, { status: 415 });
    const body = await request.json() as { action?: unknown; fileName?: unknown; contentType?: unknown; size?: unknown; token?: unknown };
    if (body.action === "init") return ok(await createExperienceEvidenceUpload({ userId: session.user.id, fileName: body.fileName, contentType: body.contentType, size: body.size }));
    if (body.action === "finalize" && typeof body.token === "string") return ok(await finalizeExperienceEvidenceUpload({ userId: session.user.id, token: body.token }));
    return Response.json({ error: "Solicitud de carga no válida." }, { status: 422 });
  } catch (error) {
    if (error instanceof ExperienceEvidenceUploadError) return Response.json({ error: error.message }, { status: error.status });
    return handleApiError(error);
  }
}
