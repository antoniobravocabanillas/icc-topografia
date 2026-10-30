import { requireUser } from "@/lib/server/authz";
import { authorizeExperienceEvidenceChunk, ExperienceEvidenceUploadError, storeExperienceEvidenceChunk } from "@/lib/server/experience-evidence-upload";
import { handleApiError, ok } from "@/lib/server/api";
import { BoundedRequestBodyError, readBoundedRequestBytes } from "@/lib/server/bounded-request-body";

type Context = { params: Promise<{ uploadId: string; index: string }> };

export async function PUT(request: Request, { params }: Context) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    if (request.headers.get("content-type")?.toLowerCase().split(";", 1)[0] !== "application/octet-stream") return Response.json({ error: "El fragmento debe enviarse como datos binarios." }, { status: 415 });
    const token = request.headers.get("x-terraqo-upload-token");
    if (!token) return Response.json({ error: "Falta la autorización de carga." }, { status: 401 });
    const { uploadId, index } = await params;
    const numericIndex = Number(index);
    const authorization = await authorizeExperienceEvidenceChunk({ userId: session.user.id, uploadId, index: numericIndex, token });
    const bytes = await readBoundedRequestBytes(request, authorization.expectedSize);
    return ok(await storeExperienceEvidenceChunk({ userId: session.user.id, uploadId, index: numericIndex, token, bytes: bytes.buffer }));
  } catch (error) {
    if (error instanceof BoundedRequestBodyError) return Response.json({ error: error.code === "BODY_TOO_LARGE" ? "El fragmento supera el límite permitido." : "El fragmento no pudo leerse." }, { status: error.status });
    if (error instanceof ExperienceEvidenceUploadError) return Response.json({ error: error.message }, { status: error.status });
    return handleApiError(error);
  }
}
