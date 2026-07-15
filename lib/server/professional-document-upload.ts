import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok } from "@/lib/server/api";
import {
  ALLOWED_CV_FILE_TYPES,
  ALLOWED_IDENTITY_FILE_TYPES,
  createProfessionalDocumentKey,
  getProfessionalDocumentStore,
  MAX_PROFESSIONAL_DOCUMENT_SIZE,
} from "@/lib/server/media";

type DocumentType = "CV" | "DNI_FRONT" | "DNI_BACK";

function getFile(formData: FormData, name: string) {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

function validateFile(file: File, type: DocumentType) {
  const allowed = type === "CV" ? ALLOWED_CV_FILE_TYPES : ALLOWED_IDENTITY_FILE_TYPES;
  if (!allowed.has(file.type)) {
    return type === "CV"
      ? "El CV debe estar en formato PDF, DOC o DOCX."
      : "Las imagenes del DNI deben estar en JPG, PNG, WEBP o PDF.";
  }
  if (file.size > MAX_PROFESSIONAL_DOCUMENT_SIZE) return "Cada archivo debe pesar como maximo 10 MB.";
  return null;
}

export async function uploadProfessionalDocuments(request: Request, userId: string, requestedWorkspaceId?: string) {
  try {
    const formData = await request.formData();
    const purpose = String(formData.get("purpose") || "");
    if (!["cv", "identity"].includes(purpose)) return fail("Tipo de carga no valido.", 400);

    const profile = await prisma.terraqoProfessionalProfile.findUnique({
      where: { userId },
      include: {
        applications: {
          where: requestedWorkspaceId ? { workspaceId: requestedWorkspaceId } : undefined,
          orderBy: { createdAt: "desc" },
          select: { workspaceId: true },
          take: 1,
        },
      },
    });
    if (!profile) return fail("Perfil profesional no encontrado.", 404);

    const workspaceId = requestedWorkspaceId || profile.applications[0]?.workspaceId;
    if (!workspaceId) return fail("El perfil no esta vinculado a un workspace.", 409);

    const membership = await prisma.terraqoWorkspaceMember.findFirst({
      where: { workspaceId, userId, active: true, role: "PROFESSIONAL" },
      select: { id: true },
    });
    if (!membership) return fail("El perfil no tiene acceso profesional a este workspace.", 403);

    const requestedFiles: Array<{ type: DocumentType; file: File }> = [];
    if (purpose === "cv") {
      const cvFile = getFile(formData, "cvFile");
      if (!cvFile) return fail("Selecciona un archivo de CV.", 400);
      requestedFiles.push({ type: "CV", file: cvFile });
    } else {
      const dniFront = getFile(formData, "dniFront");
      const dniBack = getFile(formData, "dniBack");
      if (!dniFront || !dniBack) return fail("Sube el frente y el reverso del DNI para solicitar la validacion.", 400);
      requestedFiles.push({ type: "DNI_FRONT", file: dniFront }, { type: "DNI_BACK", file: dniBack });
    }

    for (const item of requestedFiles) {
      const validationError = validateFile(item.file, item.type);
      if (validationError) return fail(validationError, 400);
    }

    const store = getProfessionalDocumentStore();
    const stored: Array<{ type: DocumentType; file: File; storageKey: string }> = [];

    try {
      for (const item of requestedFiles) {
        const storageKey = createProfessionalDocumentKey(profile.id, item.type, item.file.name);
        await store.set(storageKey, await item.file.arrayBuffer(), {
          metadata: {
            contentType: item.file.type,
            originalName: item.file.name,
            size: item.file.size,
            profileId: profile.id,
            workspaceId,
            documentType: item.type,
            uploadedBy: userId,
            uploadedAt: new Date().toISOString(),
          },
        });
        stored.push({ ...item, storageKey });
      }

      const documents = await prisma.$transaction(async (tx) => {
        await tx.terraqoProfessionalDocument.updateMany({
          where: {
            professionalProfileId: profile.id,
            workspaceId,
            type: { in: requestedFiles.map((item) => item.type) },
            reviewStatus: "SUBMITTED",
          },
          data: { reviewStatus: "REJECTED", reviewNote: "Documento reemplazado por una carga posterior." },
        });

        const createdDocuments = [];
        for (const item of stored) {
          createdDocuments.push(await tx.terraqoProfessionalDocument.create({
            data: {
              professionalProfileId: profile.id,
              workspaceId,
              type: item.type,
              storageKey: item.storageKey,
              fileName: item.file.name,
              contentType: item.file.type,
              size: item.file.size,
            },
            select: { id: true, type: true, fileName: true, reviewStatus: true },
          }));
        }

        const cvDocument = createdDocuments.find((document) => document.type === "CV");
        await tx.terraqoProfessionalProfile.update({
          where: { id: profile.id },
          data: purpose === "identity"
            ? {
                identityVerificationStatus: "UNDER_REVIEW",
                identitySubmittedAt: new Date(),
                identityVerifiedAt: null,
                identityVerificationNote: null,
              }
            : cvDocument
              ? { cvUrl: `/api/terraqo/professional-documents/${cvDocument.id}` }
              : {},
        });

        return createdDocuments;
      });

      return ok({
        documents,
        identityVerificationStatus: purpose === "identity" ? "UNDER_REVIEW" : profile.identityVerificationStatus,
        message: purpose === "identity"
          ? "Documentos recibidos. Terraqo revisara tu identidad antes de marcar el perfil como verificado."
          : "CV actualizado correctamente.",
      });
    } catch (error) {
      await Promise.all(stored.map((item) => store.delete(item.storageKey).catch(() => undefined)));
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
