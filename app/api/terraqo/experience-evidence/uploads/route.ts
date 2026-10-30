import { requireUser } from "@/lib/server/authz";
import { createExperienceEvidenceUpload, ExperienceEvidenceUploadError, finalizeExperienceEvidenceUpload } from "@/lib/server/experience-evidence-upload";
import { handleApiError, ok } from "@/lib/server/api";
import { BoundedRequestBodyError, readBoundedJson } from "@/lib/server/bounded-request-body";
import { MAX_EXPERIENCE_EVIDENCE_SIZE } from "@/lib/server/media";
import { z } from "zod";

const uploadRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("init"),
    fileName: z.string().trim().min(1).max(180),
    contentType: z.string().trim().min(1).max(100),
    size: z.number().int().positive().max(MAX_EXPERIENCE_EVIDENCE_SIZE),
  }).strict(),
  z.object({ action: z.literal("finalize"), token: z.string().min(1).max(8_192) }).strict(),
]);

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "El formato de la solicitud no es válido." }, { status: 415 });
    const parsed = uploadRequestSchema.safeParse(await readBoundedJson(request, 32 * 1024));
    if (!parsed.success) return Response.json({ error: "Solicitud de carga no válida." }, { status: 422 });
    const body = parsed.data;
    if (body.action === "init") return ok(await createExperienceEvidenceUpload({ userId: session.user.id, fileName: body.fileName, contentType: body.contentType, size: body.size }));
    return ok(await finalizeExperienceEvidenceUpload({ userId: session.user.id, token: body.token }));
  } catch (error) {
    if (error instanceof BoundedRequestBodyError) return Response.json({ error: error.code === "BODY_TOO_LARGE" ? "La solicitud supera el límite permitido." : "Solicitud de carga no válida." }, { status: error.status });
    if (error instanceof ExperienceEvidenceUploadError) return Response.json({ error: error.message }, { status: error.status });
    return handleApiError(error);
  }
}
