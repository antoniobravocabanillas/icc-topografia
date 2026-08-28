import { prisma } from "@/lib/prisma";
import { fail, handleApiError } from "@/lib/server/api";
import { ALLOWED_EXPERIENCE_EVIDENCE_TYPES, createExperienceEvidenceKey, getWorklogEvidenceStore, MAX_EXPERIENCE_EVIDENCE_SIZE } from "@/lib/server/media";

export const MAX_EXPERIENCE_EVIDENCE_FILES = 6;

export function evidenceFilesFromForm(formData: FormData) {
  return formData.getAll("evidenceFiles").filter((value): value is File => value instanceof File && value.size > 0);
}

export function validateExperienceEvidenceFiles(files: File[]) {
  if (files.length > MAX_EXPERIENCE_EVIDENCE_FILES) return `Puedes adjuntar hasta ${MAX_EXPERIENCE_EVIDENCE_FILES} archivos.`;
  for (const file of files) {
    if (!ALLOWED_EXPERIENCE_EVIDENCE_TYPES.has(file.type)) return "Solo se admiten fotos JPG, PNG, WEBP, AVIF o documentos PDF.";
    if (file.size > MAX_EXPERIENCE_EVIDENCE_SIZE) return "Cada evidencia debe pesar como máximo 8 MB.";
  }
  return null;
}

export async function storeExperienceEvidenceFiles(files: File[], experienceId: string, userId: string) {
  if (!files.length) return [];
  const store = getWorklogEvidenceStore();
  const stored: Array<{ file: File; storageKey: string }> = [];
  try {
    for (const file of files) {
      const storageKey = createExperienceEvidenceKey(experienceId, file.name);
      await store.set(storageKey, await file.arrayBuffer(), { metadata: { experienceId, uploadedBy: userId, contentType: file.type, originalName: file.name, size: file.size } });
      stored.push({ file, storageKey });
    }
    return prisma.$transaction(stored.map(({ file, storageKey }) => prisma.terraqoExperienceEvidence.create({ data: { experienceId, uploadedById: userId, storageKey, fileName: file.name, contentType: file.type, size: file.size } })));
  } catch (error) {
    await Promise.all(stored.map(({ storageKey }) => store.delete(storageKey).catch(() => undefined)));
    throw error;
  }
}

export async function getExperienceEvidenceFile(userId: string, evidenceId: string) {
  try {
    const evidence = await prisma.terraqoExperienceEvidence.findUnique({
      where: { id: evidenceId },
      include: { experience: { select: { professionalProfile: { select: { userId: true } }, validatorUserId: true, workspaceId: true } } }
    });
    if (!evidence) return fail("Evidencia no encontrada.", 404);
    const authorized = evidence.experience.professionalProfile.userId === userId || evidence.experience.validatorUserId === userId || Boolean(evidence.experience.workspaceId && await prisma.terraqoWorkspaceMember.findFirst({ where: { userId, workspaceId: evidence.experience.workspaceId, active: true }, select: { id: true } }));
    if (!authorized) return fail("No tienes permiso para ver esta evidencia.", 403);
    const entry = await getWorklogEvidenceStore().getWithMetadata(evidence.storageKey, { type: "arrayBuffer" });
    if (!entry) return fail("La evidencia ya no está disponible.", 404);
    return new Response(entry.data, { headers: { "Content-Type": evidence.contentType, "Content-Disposition": `inline; filename="${evidence.fileName.replace(/[\r\n"]/g, "-")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return handleApiError(error);
  }
}
