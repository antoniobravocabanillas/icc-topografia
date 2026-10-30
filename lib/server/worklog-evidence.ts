import { prisma } from "@/lib/prisma";
import { reserveStorage } from "@/lib/terraqo/billing/storage-quota";
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
import { BillingError } from "@/lib/terraqo/billing/provider";
import { assertLegacyWorklogs, NativeWorklogLegacyGuardError } from "./native-worklog-legacy-guard";
import {
  BoundedRequestBodyError,
  readBoundedRequestBytes,
} from "./bounded-request-body";
import {
  sanitizeWorklogEvidenceImage,
  WorklogMediaSecurityError,
} from "./worklog-media-security";

export const MAX_WORKLOG_EVIDENCE_FILES = 6;
export const MAX_WORKLOG_EVIDENCE_SOURCE_BYTES =
  MAX_WORKLOG_EVIDENCE_FILES * MAX_WORKLOG_EVIDENCE_SIZE;
export const MAX_WORKLOG_EVIDENCE_MULTIPART_BYTES =
  MAX_WORKLOG_EVIDENCE_SOURCE_BYTES + 512 * 1024;

function getPhotos(formData: FormData) {
  return formData
    .getAll("photos")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

function validatePhoto(file: File) {
  if (!ALLOWED_WORKLOG_EVIDENCE_TYPES.has(file.type)) {
    return "Las evidencias deben estar en formato JPG, PNG, WEBP o AVIF.";
  }
  if (file.size > MAX_WORKLOG_EVIDENCE_SIZE)
    return "Cada foto debe pesar como maximo 8 MB.";
  return null;
}

export async function uploadWorklogEvidence(
  request: Request,
  userId: string,
  worklogId: string,
  requiredWorkspaceId?: string,
) {
  try {
    await assertLegacyWorklogs(prisma, [worklogId]);
    const worklog = await prisma.terraqoWorklogEntry.findFirst({
      where: {
        id: worklogId,
        authorId: userId,
        deletedAt: null,
        ...(requiredWorkspaceId ? { workspaceId: requiredWorkspaceId } : {}),
      },
      select: {
        id: true,
        authorId: true,
        workspaceId: true,
        _count: { select: { media: true } },
      },
    });
    if (!worklog)
      return fail(
        "No tienes permiso para agregar evidencia a esta bitacora.",
        403,
      );

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;") || !/boundary=(?:"[^"]+"|[^;\s]+)/i.test(contentType))
      return fail("El formulario de evidencia no es válido.", 400);
    const multipartBytes = await readBoundedRequestBytes(
      request,
      MAX_WORKLOG_EVIDENCE_MULTIPART_BYTES,
    );
    let formData: FormData;
    try {
      formData = await new Request(request.url, {
        method: "POST",
        headers: { "content-type": contentType },
        body: multipartBytes,
      }).formData();
    } catch {
      return fail("El formulario de evidencia no es válido.", 400);
    }
    const parts = [...formData.entries()];
    if (parts.length > MAX_WORKLOG_EVIDENCE_FILES)
      return fail(
        `Cada bitácora admite hasta ${MAX_WORKLOG_EVIDENCE_FILES} fotos.`,
        400,
      );
    if (parts.some(([name, value]) => name !== "photos" || !(value instanceof File)))
      return fail("El formulario contiene campos de evidencia no permitidos.", 400);
    const photos = getPhotos(formData);
    if (!photos.length)
      return fail("Selecciona al menos una foto como evidencia.", 400);
    // Reject an abusive multipart set before any image is decoded or copied.
    // The per-file check below remains necessary for a small set containing one
    // oversized image.
    if (photos.length > MAX_WORKLOG_EVIDENCE_FILES)
      return fail(
        `Cada bitácora admite hasta ${MAX_WORKLOG_EVIDENCE_FILES} fotos.`,
        400,
      );
    const sourceBytes = photos.reduce((total, photo) => total + photo.size, 0);
    if (
      !Number.isSafeInteger(sourceBytes) ||
      sourceBytes > MAX_WORKLOG_EVIDENCE_SOURCE_BYTES
    )
      return fail("El conjunto de evidencias supera el tamaño permitido.", 413);

    for (const photo of photos) {
      const validationError = validatePhoto(photo);
      if (validationError) return fail(validationError, 400);
    }

    const candidates: Array<{ file: File; sha256: string }> = [];
    for (const file of photos) {
      const sourceSha256 = createHash("sha256")
        .update(Buffer.from(await file.arrayBuffer()))
        .digest("hex");
      candidates.push({ file, sha256: sourceSha256 });
    }
    const unique = [
      ...new Map(candidates.map((item) => [item.sha256, item])).values(),
    ];
    const mediaSelect = {
      id: true,
      fileName: true,
      contentType: true,
      size: true,
      sortOrder: true,
      createdAt: true,
    } as const;
    // A lost HTTP response must not turn a successful upload into a duplicate error.
    const existing = await prisma.terraqoWorklogMedia.findMany({
      where: { worklogId, sha256: { in: unique.map((item) => item.sha256) } },
      select: { ...mediaSelect, sha256: true },
    });
    const known = new Set(existing.map((item) => item.sha256));
    const pendingCandidates = unique.filter((item) => !known.has(item.sha256));
    if (!pendingCandidates.length)
      return ok({
        media: existing,
        message: "Las fotos ya están adjuntas a esta bitácora.",
      });
    if (worklog._count.media + pendingCandidates.length > MAX_WORKLOG_EVIDENCE_FILES)
      return fail(
        `Cada bitácora admite hasta ${MAX_WORKLOG_EVIDENCE_FILES} fotos.`,
        400,
      );
    const hashes = pendingCandidates.map((item) => item.sha256);
    const duplicate = await prisma.terraqoWorklogMedia.findFirst({
      where: {
        worklogId: { not: worklogId },
        sha256: { in: hashes },
        worklog: { authorId: worklog.authorId, deletedAt: null },
      },
      select: { id: true },
    });
    if (duplicate)
      return fail(
        "Esta evidencia visual ya fue utilizada en otra bitácora. Adjunta una foto original del trabajo.",
        409,
      );

    const prepared: Array<{
      file: File;
      bytes: Buffer;
      safeFileName: string;
      safeContentType: string;
      sourceFormat: string;
      width: number;
      height: number;
      sha256: string;
    }> = [];
    // Decode only the unique, authorized images that still fit the remaining
    // worklog quota. Sequential decoding also caps native/WASM peak memory.
    for (const candidate of pendingCandidates) {
      const sanitized = await sanitizeWorklogEvidenceImage({
        bytes: await candidate.file.arrayBuffer(),
        claimedContentType: candidate.file.type,
        fileName: candidate.file.name,
      });
      prepared.push({
        file: candidate.file,
        bytes: sanitized.bytes,
        safeFileName: sanitized.fileName,
        safeContentType: sanitized.contentType,
        sourceFormat: sanitized.sourceFormat,
        width: sanitized.width,
        height: sanitized.height,
        sha256: candidate.sha256,
      });
    }

    const store = getWorklogEvidenceStore();
    const stored: Array<{
      file: File;
      storageKey: string;
      sortOrder: number;
      sha256: string;
    }> = [];
    const reservation = await reserveStorage(
      userId,
      prepared.reduce((sum, item) => sum + item.file.size, 0),
    );

    try {
      for (const [index, preparedPhoto] of prepared.entries()) {
        const photo = preparedPhoto.file;
        const storageKey = createWorklogEvidenceKey(
          worklog.id,
          preparedPhoto.safeFileName,
        );
        const sortOrder = worklog._count.media + index;
        await store.set(
          storageKey,
          Uint8Array.from(preparedPhoto.bytes).buffer,
          {
          metadata: {
            contentType: preparedPhoto.safeContentType,
            originalName: photo.name,
            sourceSize: photo.size,
            size: preparedPhoto.bytes.byteLength,
            sourceFormat: preparedPhoto.sourceFormat,
            width: preparedPhoto.width,
            height: preparedPhoto.height,
            sanitized: true,
            worklogId: worklog.id,
            workspaceId: worklog.workspaceId,
            uploadedBy: userId,
            uploadedAt: new Date().toISOString(),
          },
        },
        );
        stored.push({
          file: photo,
          storageKey,
          sortOrder,
          sha256: preparedPhoto.sha256,
        });
      }

      const media = await prisma.$transaction(
        async (tx) => {
          await assertLegacyWorklogs(tx, [worklogId]);
          // Serialize finalization by author; network/blob I/O stays outside the lock.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worklog-evidence:${userId}`}))`;
          const current = await tx.terraqoWorklogEntry.findFirst({
            where: { id: worklogId, authorId: userId, deletedAt: null },
            select: { id: true },
          });
          if (!current) throw new Error("WORKLOG_UNAVAILABLE");
          const concurrent = await tx.terraqoWorklogMedia.findMany({
            where: {
              sha256: { in: hashes },
              worklog: { authorId: userId, deletedAt: null },
            },
            select: { worklogId: true },
          });
          if (concurrent.length) throw new Error("EVIDENCE_RETRY");
          const count = await tx.terraqoWorklogMedia.count({
            where: { worklogId },
          });
          if (count + stored.length > MAX_WORKLOG_EVIDENCE_FILES)
            throw new Error("EVIDENCE_LIMIT");
          return Promise.all(
            stored.map((item, index) =>
              tx.terraqoWorklogMedia.create({
                data: {
                  worklogId: worklog.id,
                  storageKey: item.storageKey,
                  fileName: prepared[index].safeFileName,
                  contentType: prepared[index].safeContentType,
                  size: prepared[index].bytes.byteLength,
                  sha256: item.sha256,
                  sortOrder: count + index,
                },
                select: {
                  id: true,
                  fileName: true,
                  contentType: true,
                  size: true,
                  sortOrder: true,
                  createdAt: true,
                },
              }),
            ),
          );
        },
        { maxWait: 15000, timeout: 10000 },
      );

      await syncWorklogReputation(worklog.id).catch((error) =>
        console.warn(
          "No se pudo recalcular la confianza de la bitácora.",
          error,
        ),
      );

      return ok({
        media: [...existing, ...media],
        message:
          prepared.length === 1
            ? "Foto agregada a tu bitacora."
            : "Fotos agregadas a tu bitacora.",
      });
    } catch (error) {
      await reservation.release();
      await Promise.all(
        stored.map((item) =>
          store.delete(item.storageKey).catch(() => undefined),
        ),
      );
      if (error instanceof Error && error.message === "EVIDENCE_RETRY") {
        const confirmed = await prisma.terraqoWorklogMedia.findMany({
          where: { worklogId, sha256: { in: hashes } },
          select: mediaSelect,
        });
        if (confirmed.length === prepared.length)
          return ok({
            media: [...existing, ...confirmed],
            message: "Las fotos ya están adjuntas.",
          });
        return fail(
          "La evidencia cambió durante la carga. Reintenta las fotos pendientes.",
          409,
        );
      }
      if (error instanceof Error && error.message === "EVIDENCE_LIMIT")
        return fail("Esta bitácora ya tiene 6 fotos.", 409);
      throw error;
    }
  } catch (error) {
    if (error instanceof BoundedRequestBodyError) {
      const message = error.status === 413
        ? "El conjunto de evidencias supera el tamaño permitido."
        : error.status === 408
          ? "La carga de evidencias tardó demasiado. Reintenta."
          : "El formulario de evidencia no es válido.";
      return fail(message, error.status);
    }
    if (error instanceof WorklogMediaSecurityError)
      return fail(error.message, 422);
    if (error instanceof BillingError) return handleApiError(error);
    if (error instanceof NativeWorklogLegacyGuardError) return fail(error.message, error.status);
    console.error("worklog-evidence: upload failed", { worklogId, error });
    return fail(
      "No pudimos guardar la foto en el almacenamiento. Reintenta; tu bitácora permanece guardada.",
      503,
    );
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
    if (
      requiredWorkspaceId &&
      media.worklog.workspaceId !== requiredWorkspaceId
    ) {
      return fail("No tienes permiso para ver esta evidencia.", 403);
    }

    const visibleWorklog = await canViewWorklog(userId, media.worklogId);
    if (!visibleWorklog)
      return fail("No tienes permiso para ver esta evidencia.", 403);

    const entry = await getWorklogEvidenceStore().getWithMetadata(
      media.storageKey,
      { type: "arrayBuffer" },
    );
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
