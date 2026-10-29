import { requireUser } from "@/lib/server/authz";
import { EXPERIENCE_EVIDENCE_CHUNK_SIZE, ExperienceEvidenceUploadError, storeExperienceEvidenceChunk } from "@/lib/server/experience-evidence-upload";
import { handleApiError, ok } from "@/lib/server/api";

type Context = { params: Promise<{ uploadId: string; index: string }> };

export async function PUT(request: Request, { params }: Context) {
  const { response, session } = await requireUser();
  if (response) return response;
  try {
    if (request.headers.get("content-type")?.toLowerCase().split(";", 1)[0] !== "application/octet-stream") return Response.json({ error: "El fragmento debe enviarse como datos binarios." }, { status: 415 });
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > EXPERIENCE_EVIDENCE_CHUNK_SIZE) return Response.json({ error: "El fragmento supera el límite permitido." }, { status: 413 });
    const token = request.headers.get("x-terraqo-upload-token");
    if (!token) return Response.json({ error: "Falta la autorización de carga." }, { status: 401 });
    const { uploadId, index } = await params;
    const numericIndex = Number(index);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > EXPERIENCE_EVIDENCE_CHUNK_SIZE) return Response.json({ error: "El fragmento supera el límite permitido." }, { status: 413 });
    return ok(await storeExperienceEvidenceChunk({ userId: session.user.id, uploadId, index: numericIndex, token, bytes }));
  } catch (error) {
    if (error instanceof ExperienceEvidenceUploadError) return Response.json({ error: error.message }, { status: error.status });
    return handleApiError(error);
  }
}
