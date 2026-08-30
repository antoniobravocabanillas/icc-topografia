import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { fail, handleApiError, ok } from "@/lib/server/api";
import {
  ALLOWED_WORKLOG_EVIDENCE_TYPES,
  createWorklogEvidenceKey,
  getWorklogEvidenceStore,
  MAX_WORKLOG_EVIDENCE_SIZE,
} from "@/lib/server/media";
import { canViewWorklog } from "@/lib/terraqo/worklog";
import { syncWorklogReputation } from "@/lib/terraqo/builders";

export const MAX_WORKLOG_EVIDENCE_FILES = 6;

function getPhotos(formData: FormData) {
  return formData
    .getAll("photos")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

function validatePhoto(file: File) {
  if (!ALLOWED_WORKLOG_EVIDENCE_TYPES.has(file.type)) {
    return "Las evidencias deben estar en formato JPG, PNG, WEBP o AVIF.";
  }
  if (file.size > MAX_WORKLOG_EVIDENCE_SIZE) return "Cada foto debe pesar como maximo 8 MB.";
  return null;
}

export async function uploadWorklogEvidence(
  request: Request,
  userId: string,
  worklogId: string,
  requiredWorkspaceId?: string,
) {
  try {
    const worklog = await prisma.terraqoWorklogEntry.findFirst({
      where: {
        id: worklogId,
        authorId: userId,
        deletedAt: null,
        ...(requiredWorkspaceId ? { workspaceId: requiredWorkspaceId } : {}),
      },
      select: { id: true, authorId: true, workspaceId: true, _count: { select: { media: true } } },
    });
    if (!worklog) return fail("No tienes permiso para agregar evidencia a esta bitacora.", 403);

    const formData = await request.formData();
    const photos = getPhotos(formData);
    if (!photos.length) return fail("Selecciona al menos una foto como evidencia.", 400);
    if (worklog._count.media + photos.length > MAX_WORKLOG_EVIDENCE_FILES) {
      return fail(`Cada bitacora admite hasta ${MAX_WORKLOG_EVIDENCE_FILES} fotos.`, 400);
    }

    for (const photo of photos) {
      const validationError = validatePhoto(photo);
      if (validationError) return fail(validationError, 400);
    }

    const prepared = await Promise.all(photos.map(async (file) => { const bytes = await file.arrayBuffer(); return { file, bytes, sha256: createHash("sha256").update(Buffer.from(bytes)).digest("hex") }; }));
    const hashes = prepared.map((item) => item.sha256);
    const duplicate = await prisma.terraqoWorklogMedia.findFirst({ where: { sha256: { in: hashes }, worklog: { authorId: worklog.authorId, deletedAt: null } }, select: { id: true } });
    if (duplicate) return fail("Esta evidencia visual ya fue utilizada en otra bitácora. Adjunta una foto original del trabajo.", 409);

    const store = getWorklogEvidenceStore();
    const stored: Array<{ file: File; storageKey: string; sortOrder: number; sha256: string }> = [];

    try {
      for (const [index, preparedPhoto] of prepared.entries()) {
        const photo = preparedPhoto.file;
        const storageKey = createWorklogEvidenceKey(worklog.id, photo.name);
        const sortOrder = worklog._count.media + index;
        await store.set(storageKey, preparedPhoto.bytes, {
          metadata: {
            contentType: photo.type,
            originalName: photo.name,
            size: photo.size,
            worklogId: worklog.id,
            workspaceId: worklog.workspaceId,
            uploadedBy: userId,
            uploadedAt: new Date().toISOString(),
          },
        });
        stored.push({ file: photo, storageKey, sortOrder, sha256: preparedPhoto.sha256 });
      }

      const media = await prisma.$transaction(
        stored.map((item) => prisma.terraqoWorklogMedia.create({
          data: {
            worklogId: worklog.id,
            storageKey: item.storageKey,
            fileName: item.file.name,
            contentType: item.file.type,
            size: item.file.size,
            sha256: item.sha256,
            sortOrder: item.sortOrder,
          },
          select: { id: true, fileName: true, contentType: true, size: true, sortOrder: true, createdAt: true },
        })),
      );

      await syncWorklogReputation(worklog.id).catch((error) => console.warn("No se pudo recalcular la confianza de la bitácora.", error));

      return ok({ media, message: photos.length === 1 ? "Foto agregada a tu bitacora." : "Fotos agregadas a tu bitacora." });
    } catch (error) {
      await Promise.all(stored.map((item) => store.delete(item.storageKey).catch(() => undefined)));
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function getWorklogEvidenceFile(
  userId: string,
  mediaId: string,
  requiredWorkspaceId?: string,
) {
  try {
    const media = await prisma.terraqoWorklogMedia.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        worklogId: true,
        storageKey: true,
        fileName: true,
        contentType: true,
        worklog: { select: { workspaceId: true } },
      },
    });
    if (!media) return fail("Evidencia no encontrada.", 404);
    if (requiredWorkspaceId && media.worklog.workspaceId !== requiredWorkspaceId) {
      return fail("No tienes permiso para ver esta evidencia.", 403);
    }

    const visibleWorklog = await canViewWorklog(userId, media.worklogId);
    if (!visibleWorklog) return fail("No tienes permiso para ver esta evidencia.", 403);

    const entry = await getWorklogEvidenceStore().getWithMetadata(media.storageKey, { type: "arrayBuffer" });
    if (!entry) return fail("La evidencia ya no esta disponible.", 404);

    const safeName = media.fileName.replace(/[\r\n"]/g, "-");
    return new Response(entry.data, {
      headers: {
        "Content-Type": media.contentType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        ETag: entry.etag || "",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
