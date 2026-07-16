import type { TerraqoFileCategory, TerraqoFileVisibility, TerraqoNoteKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok } from "@/lib/server/api";
import {
  ALLOWED_WORKSPACE_FILE_TYPES,
  createWorkspaceFileKey,
  getWorkspaceFileStore,
  MAX_WORKSPACE_FILE_SIZE
} from "@/lib/server/media";

const noteKinds = new Set<TerraqoNoteKind>(["SIMPLE", "SECURE"]);
const fileVisibilities = new Set<TerraqoFileVisibility>(["PRIVATE", "WORKSPACE"]);
const fileCategories = new Set<TerraqoFileCategory>([
  "PLAN", "REPORT", "SPREADSHEET", "PRESENTATION", "IMAGE", "SOURCE_FILE", "CONTRACT", "TEMPLATE", "OTHER"
]);
const allowedExtensions = new Set([
  "pdf", "jpg", "jpeg", "png", "webp", "avif", "txt", "csv", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "dwg", "dxf", "zip"
]);

async function hasMembership(userId: string, workspaceId: string) {
  return prisma.terraqoWorkspaceMember.findFirst({
    where: { userId, workspaceId, active: true, workspace: { active: true, deletedAt: null } },
    select: { id: true, role: true }
  });
}

export async function listPrivateNotes(userId: string, workspaceId: string) {
  if (!(await hasMembership(userId, workspaceId))) return fail("No perteneces al workspace seleccionado.", 403);
  const notes = await prisma.terraqoPrivateNote.findMany({
    where: { userId, workspaceId },
    select: { id: true, kind: true, title: true, body: true, securePayload: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" }
  });
  return ok(notes);
}

export async function createPrivateNote(request: Request, userId: string, requiredWorkspaceId?: string) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const workspaceId = requiredWorkspaceId || String(payload.workspaceId || "");
    const kind = String(payload.kind || "SIMPLE") as TerraqoNoteKind;
    if (!workspaceId || !noteKinds.has(kind)) return fail("Datos de nota no validos.", 422);
    if (!(await hasMembership(userId, workspaceId))) return fail("No perteneces al workspace seleccionado.", 403);

    const title = String(payload.title || "").trim();
    const body = String(payload.body || "").trim();
    const securePayload = String(payload.securePayload || "");
    if (kind === "SIMPLE" && (!title || !body || title.length > 140 || body.length > 24000)) return fail("Completa la nota y respeta los limites de contenido.", 422);
    if (kind === "SECURE" && (securePayload.length < 80 || securePayload.length > 60000)) return fail("El contenido cifrado no es valido.", 422);

    const note = await prisma.terraqoPrivateNote.create({
      data: {
        userId,
        workspaceId,
        kind,
        title: kind === "SIMPLE" ? title : null,
        body: kind === "SIMPLE" ? body : null,
        securePayload: kind === "SECURE" ? securePayload : null
      },
      select: { id: true, kind: true, title: true, body: true, securePayload: true, createdAt: true, updatedAt: true }
    });
    return ok(note, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function updatePrivateNote(request: Request, userId: string, id: string, requiredWorkspaceId?: string) {
  try {
    const existing = await prisma.terraqoPrivateNote.findFirst({ where: { id, userId, ...(requiredWorkspaceId ? { workspaceId: requiredWorkspaceId } : {}) } });
    if (!existing) return fail("Nota no encontrada.", 404);
    const payload = await request.json() as Record<string, unknown>;
    const title = String(payload.title || "").trim();
    const body = String(payload.body || "").trim();
    const securePayload = String(payload.securePayload || "");
    if (existing.kind === "SIMPLE" && (!title || !body || title.length > 140 || body.length > 24000)) return fail("Completa la nota y respeta los limites de contenido.", 422);
    if (existing.kind === "SECURE" && (securePayload.length < 80 || securePayload.length > 60000)) return fail("El contenido cifrado no es valido.", 422);
    const note = await prisma.terraqoPrivateNote.update({
      where: { id },
      data: existing.kind === "SIMPLE" ? { title, body } : { securePayload },
      select: { id: true, kind: true, title: true, body: true, securePayload: true, createdAt: true, updatedAt: true }
    });
    return ok(note);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function deletePrivateNote(userId: string, id: string, requiredWorkspaceId?: string) {
  const note = await prisma.terraqoPrivateNote.findFirst({ where: { id, userId, ...(requiredWorkspaceId ? { workspaceId: requiredWorkspaceId } : {}) }, select: { id: true } });
  if (!note) return fail("Nota no encontrada.", 404);
  await prisma.terraqoPrivateNote.delete({ where: { id } });
  return ok({ deleted: true });
}

export async function listWorkspaceFiles(userId: string, workspaceId: string) {
  const membership = await hasMembership(userId, workspaceId);
  if (!membership) return fail("No perteneces al workspace seleccionado.", 403);
  const canReview = ["OWNER", "ADMIN", "MANAGER"].includes(membership.role);
  const files = await prisma.terraqoWorkspaceFile.findMany({
    where: {
      workspaceId,
      OR: [{ userId }, ...(canReview ? [{ visibility: "WORKSPACE" as const }] : [])]
    },
    select: {
      id: true, userId: true, category: true, visibility: true, title: true, description: true, projectName: true,
      fileName: true, contentType: true, size: true, createdAt: true, updatedAt: true,
      user: { select: { name: true, email: true, image: true } }
    },
    orderBy: { createdAt: "desc" }
  });
  return ok(files);
}

export async function uploadWorkspaceFile(request: Request, userId: string, requiredWorkspaceId?: string) {
  try {
    const formData = await request.formData();
    const workspaceId = requiredWorkspaceId || String(formData.get("workspaceId") || "");
    const category = String(formData.get("category") || "OTHER") as TerraqoFileCategory;
    const visibility = String(formData.get("visibility") || "PRIVATE") as TerraqoFileVisibility;
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const projectName = String(formData.get("projectName") || "").trim();
    const file = formData.get("file");
    if (!workspaceId || !title || title.length > 160 || !fileCategories.has(category) || !fileVisibilities.has(visibility)) return fail("Completa los datos obligatorios del archivo.", 422);
    if (!(file instanceof File) || file.size === 0) return fail("Selecciona un archivo.", 422);
    if (!(await hasMembership(userId, workspaceId))) return fail("No perteneces al workspace seleccionado.", 403);
    const extension = file.name.toLowerCase().split(".").pop() || "";
    if (!allowedExtensions.has(extension) || !ALLOWED_WORKSPACE_FILE_TYPES.has(file.type || "application/octet-stream")) return fail("Formato no permitido. Usa documentos, imagenes, hojas de calculo, presentaciones, DWG, DXF o ZIP.", 415);
    if (file.size > MAX_WORKSPACE_FILE_SIZE) return fail("El archivo debe pesar como maximo 35 MB.", 413);

    const storageKey = createWorkspaceFileKey(workspaceId, userId, file.name);
    const store = getWorkspaceFileStore();
    await store.set(storageKey, await file.arrayBuffer(), { metadata: { workspaceId, userId, originalName: file.name, contentType: file.type, size: file.size } });
    try {
      const created = await prisma.terraqoWorkspaceFile.create({
        data: { userId, workspaceId, category, visibility, title, description: description || null, projectName: projectName || null, storageKey, fileName: file.name, contentType: file.type || "application/octet-stream", size: file.size },
        select: { id: true, category: true, visibility: true, title: true, description: true, projectName: true, fileName: true, contentType: true, size: true, createdAt: true }
      });
      return ok(created, { status: 201 });
    } catch (error) {
      await store.delete(storageKey).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}

async function authorizedFile(userId: string, id: string, requiredWorkspaceId?: string) {
  const file = await prisma.terraqoWorkspaceFile.findFirst({ where: { id, ...(requiredWorkspaceId ? { workspaceId: requiredWorkspaceId } : {}) } });
  if (!file) return null;
  if (file.userId === userId) return file;
  if (file.visibility !== "WORKSPACE") return null;
  const membership = await hasMembership(userId, file.workspaceId);
  return membership && ["OWNER", "ADMIN", "MANAGER"].includes(membership.role) ? file : null;
}

export async function serveWorkspaceFile(request: Request, userId: string, id: string, requiredWorkspaceId?: string) {
  const file = await authorizedFile(userId, id, requiredWorkspaceId);
  if (!file) return fail("Archivo no encontrado o sin permiso de acceso.", 404);
  const entry = await getWorkspaceFileStore().getWithMetadata(file.storageKey, { type: "arrayBuffer" });
  if (!entry) return fail("El archivo ya no esta disponible.", 404);
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const safeName = file.fileName.replace(/[\r\n"]/g, "-");
  const previewable = file.contentType.startsWith("image/") || file.contentType === "application/pdf" || file.contentType.startsWith("text/");
  return new Response(entry.data, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${inline && previewable ? "inline" : "attachment"}; filename="${safeName}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      ETag: entry.etag || ""
    }
  });
}

export async function deleteWorkspaceFile(userId: string, id: string, requiredWorkspaceId?: string) {
  const file = await prisma.terraqoWorkspaceFile.findFirst({ where: { id, userId, ...(requiredWorkspaceId ? { workspaceId: requiredWorkspaceId } : {}) } });
  if (!file) return fail("Archivo no encontrado.", 404);
  await prisma.terraqoWorkspaceFile.delete({ where: { id } });
  await getWorkspaceFileStore().delete(file.storageKey).catch(() => undefined);
  return ok({ deleted: true });
}
