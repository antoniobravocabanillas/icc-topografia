import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "./authz";
import { isSameOriginMutation } from "./same-origin-mutation";
import { readBoundedJson, readBoundedRequestBytes, BoundedRequestBodyError } from "./bounded-request-body";
import { DocumentLifecycleError, withdrawProfessionalDocumentInTransaction } from "./professional-document-lifecycle";
import { ReplacementUploadUnconfirmed, uploadDocumentReplacement } from "./document-replacement-upload";
import { getProfessionalDocumentStore } from "./media";

const commandSchema = z.object({
  expectedVersion: z.number().int().min(1).max(2147483646),
  operationKey: z.string().regex(/^[a-zA-Z0-9_-]{16,128}$/),
}).strict();
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

/** Disabled until schema, cleanup dispatcher and staging acceptance are ready.
 * The actor and storage adapter are always server-owned, never request fields.
 */
export async function documentLifecycleMutation(request: Request, documentId: string, action: "withdraw" | "replace") {
  if (process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1 !== "true") return json({ error: "No disponible." }, 404);
  const requestId = randomUUID();
  let phase = "authorization";
  try {
    const auth = await requireUser();
    if (auth.response) return json({ error: "Inicia sesión para continuar." }, 401);
    if (!isSameOriginMutation(request)) return json({ error: "Origen no permitido." }, 403);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(documentId)) return json({ error: "Documento no válido." }, 422);
    const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    phase = "parse";
    if (action === "withdraw") {
      if (mediaType !== "application/json") return json({ error: "Usa formato JSON." }, 415);
      const command = commandSchema.parse(await readBoundedJson(request, 2048));
      phase = "withdrawal";
      const result = await prisma.$transaction(tx => withdrawProfessionalDocumentInTransaction(tx, {
        ...command, actorId: auth.session.user.id, documentId,
      }), { maxWait: 1000, timeout: 7000 });
      return json({ data: result });
    }
    if (mediaType !== "multipart/form-data") return json({ error: "Adjunta el archivo como formulario." }, 415);
    // Read the actual stream before parsing; Content-Length is not a trust boundary.
    const bytes = await readBoundedRequestBytes(request, 10485760 + 65536);
    let form: FormData;
    try {
      form = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type")! }, body: bytes.buffer as ArrayBuffer }).formData();
    } catch { throw new BoundedRequestBodyError("INVALID_BODY", 400); }
    const fields = ["file", "expectedVersion", "operationKey"];
    if ([...form.keys()].some(key => !fields.includes(key)) || fields.some(key => form.getAll(key).length !== 1))
      return json({ error: "El formulario contiene campos duplicados o no admitidos." }, 422);
    const version = form.get("expectedVersion");
    const file = form.get("file");
    if (typeof version !== "string" || !/^[1-9][0-9]{0,9}$/.test(version) || !(file instanceof File))
      return json({ error: "Selecciona un archivo y una versión válidos." }, 422);
    const command = commandSchema.parse({ expectedVersion: Number(version), operationKey: form.get("operationKey") });
    phase = "replacement";
    const result = await uploadDocumentReplacement(prisma, getProfessionalDocumentStore(), {
      ...command, actorId: auth.session.user.id, documentId, file,
    });
    return json({ data: result });
  } catch (error) {
    if (error instanceof DocumentLifecycleError || error instanceof ReplacementUploadUnconfirmed)
      return json({ error: error.message }, error.status);
    if (error instanceof BoundedRequestBodyError) return json({ error: "Solicitud inválida o demasiado grande." }, error.status);
    if (error instanceof z.ZodError) return json({ error: "Actualiza el expediente y revisa los datos enviados." }, 422);
    // Correlate unexpected infrastructure failures without recording identity,
    // file names, request bodies, SQL messages or stack traces.
    const rawCode = (error as { code?: unknown } | null)?.code;
    const code = typeof rawCode === "string" && /^P\d{4}$/.test(rawCode) ? rawCode : "UNEXPECTED";
    console.error(JSON.stringify({ event: "document-lifecycle-failure", requestId, action, phase, code }));
    return Response.json({ error: "No se pudo confirmar la operación. Actualiza el expediente antes de reintentar.", requestId }, {
      status: 500, headers: { "Cache-Control": "private, no-store", "x-request-id": requestId },
    });
  }
}
