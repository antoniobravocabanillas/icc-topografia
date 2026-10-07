import { validatePrivateProfessionalFile } from "./professional-file-validation";
import { prisma } from "@/lib/prisma";
import { reserveStorage } from "@/lib/terraqo/billing/storage-quota";
import { fail, handleApiError, ok } from "@/lib/server/api";
import {
  ALLOWED_CV_FILE_TYPES,
  ALLOWED_IDENTITY_FILE_TYPES,
  ALLOWED_PRIVATE_DOCUMENT_TYPES,
  createProfessionalDocumentKey,
  getProfessionalDocumentStore,
  MAX_PROFESSIONAL_DOCUMENT_SIZE,
} from "@/lib/server/media";

type DocumentType =
  | "CV"
  | "DNI_FRONT"
  | "DNI_BACK"
  | "CERTIFICATE"
  | "PROFESSIONAL_LICENSE"
  | "CRIMINAL_RECORD"
  | "MEDICAL_EXAM"
  | "BANK_CERTIFICATE"
  | "OTHER";

const privateDocumentTypes = new Set<DocumentType>([
  "CERTIFICATE",
  "PROFESSIONAL_LICENSE",
  "CRIMINAL_RECORD",
  "MEDICAL_EXAM",
  "BANK_CERTIFICATE",
  "OTHER",
]);

function getFile(formData: FormData, name: string) {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

function validateFile(file: File, type: DocumentType) {
  const allowed = type === "CV"
    ? ALLOWED_CV_FILE_TYPES
    : type === "DNI_FRONT" || type === "DNI_BACK"
      ? ALLOWED_IDENTITY_FILE_TYPES
      : ALLOWED_PRIVATE_DOCUMENT_TYPES;
  if (!allowed.has(file.type)) {
    return type === "CV"
      ? "El CV debe estar en formato PDF, DOC o DOCX."
      : type === "DNI_FRONT" || type === "DNI_BACK"
        ? "Las imagenes del DNI deben estar en JPG, PNG, WEBP o PDF."
        : "El documento debe estar en PDF, JPG, PNG o WEBP para poder previsualizarlo de forma segura.";
  }
  if (file.size > MAX_PROFESSIONAL_DOCUMENT_SIZE) return "Cada archivo debe pesar como maximo 10 MB.";
  return null;
}

export async function uploadProfessionalDocuments(request: Request, userId: string, requestedWorkspaceId?: string) {
  try {
    const native = request.headers.get("x-terraqo-native-upload") === "1";
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (native && contentLength > 4 * 1024 * 1024 + 65536) return fail("El archivo supera el límite móvil de 4 MB.", 413);
    const formData = await request.formData();
    const purpose = String(formData.get("purpose") || "");
    if (native && purpose !== "document") return fail("Esta carga móvil requiere una categoría documental.", 422);
    if (!["cv", "identity", "document"].includes(purpose)) return fail("Tipo de carga no valido.", 400);

    const profile = await prisma.terraqoProfessionalProfile.findUnique({ where: { userId } });
    if (!profile) return fail("Perfil profesional no encontrado.", 404);

    // A professional owns a personal Terraqo profile. A company workspace is
    // only required when the upload originates from that company's portal.
    const workspaceId = requestedWorkspaceId || null;
    if (workspaceId) {
      const membership = await prisma.terraqoWorkspaceMember.findFirst({
        where: { workspaceId, userId, active: true, role: "PROFESSIONAL" },
        select: { id: true },
      });
      if (!membership) return fail("El perfil no tiene acceso profesional a este workspace.", 403);
    }

    const requestedFiles: Array<{ type: DocumentType; file: File }> = [];
    if (purpose === "cv") {
      const cvFile = getFile(formData, "cvFile");
      if (!cvFile) return fail("Selecciona un archivo de CV.", 400);
      requestedFiles.push({ type: "CV", file: cvFile });
    } else if (purpose === "identity") {
      const dniFront = getFile(formData, "dniFront");
      const dniBack = getFile(formData, "dniBack");
      if (!dniFront || !dniBack) return fail("Sube el frente y el reverso del DNI para solicitar la validacion.", 400);
      requestedFiles.push({ type: "DNI_FRONT", file: dniFront }, { type: "DNI_BACK", file: dniBack });
    } else {
      const documentType = String(formData.get("documentType") || "") as DocumentType;
      const documentFile = getFile(formData, "documentFile");
      if (!privateDocumentTypes.has(documentType)) return fail("Selecciona una categoria documental valida.", 400);
      if (!documentFile) return fail("Selecciona el documento que deseas cargar.", 400);
      requestedFiles.push({ type: documentType, file: documentFile });
    }

    for (const item of requestedFiles) {
      const validationError = validateFile(item.file, item.type);
      if (validationError) return fail(validationError, 400);
      if (native && item.file.size > 4 * 1024 * 1024) return fail("El archivo supera el límite móvil de 4 MB.", 413);
      if (purpose === "document" || purpose === "identity") {
        const contentError = await validatePrivateProfessionalFile(item.file);
        if (contentError) return fail(contentError, 422);
      }
    }

    const store = getProfessionalDocumentStore();
    const stored: Array<{ type: DocumentType; file: File; storageKey: string }> = [];
    const reservation=await reserveStorage(userId,requestedFiles.reduce((sum,item)=>sum+item.file.size,0));

    try {
      for (const item of requestedFiles) {
        const storageKey = createProfessionalDocumentKey(profile.id, item.type, item.file.name);
        stored.push({ ...item, storageKey });
        await store.set(storageKey, await item.file.arrayBuffer(), {
          metadata: {
            contentType: item.file.type,
            originalName: item.file.name,
            size: item.file.size,
            profileId: profile.id,
            ...(workspaceId ? { workspaceId } : {}),
            documentType: item.type,
            uploadedBy: userId,
            uploadedAt: new Date().toISOString(),
          },
        });
      }

      const documents = await prisma.$transaction(async (tx) => {
        if (purpose !== "document") {
          await tx.terraqoProfessionalDocument.updateMany({
            where: {
              professionalProfileId: profile.id,
              workspaceId,
              type: { in: requestedFiles.map((item) => item.type) },
              reviewStatus: "SUBMITTED",
            },
            data: { reviewStatus: "REJECTED", reviewNote: "Documento reemplazado por una carga posterior." },
          });
        }

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

        if (native && workspaceId) {
          for (const document of createdDocuments) await tx.activityLog.create({ data: {
            actorId: userId, terraqoWorkspaceId: workspaceId, action: "CREATED", entityType: "ProfessionalDocument",
            entityId: document.id, title: "Documento privado recibido", metadata: { source: "native-portal", type: document.type },
          } });
        }
        return createdDocuments;
      });

      return ok({
        documents,
        identityVerificationStatus: purpose === "identity" ? "UNDER_REVIEW" : profile.identityVerificationStatus,
        message: purpose === "identity"
          ? "Documentos recibidos. Terraqo revisara tu identidad antes de marcar el perfil como verificado."
          : purpose === "cv"
            ? "CV actualizado correctamente."
            : "Documento agregado a tu expediente privado.",
      });
    } catch (error) {
      // Do not refund capacity for a blob that could not be removed. Preserve
      // a private durable marker so operational recovery can retry its removal.
      if (!native || !workspaceId) {
        await Promise.all(stored.map(item => store.delete(item.storageKey)));
        await reservation.release();
        throw error;
      }
      let cleaned = true;
      for (const item of stored) {
        try { await store.delete(item.storageKey); }
        catch {
          cleaned = false;
          await prisma.activityLog.create({ data: { actorId: userId, terraqoWorkspaceId: workspaceId,
            action: "DELETED", entityType: "ProfessionalDocument", entityId: item.storageKey,
            title: "Limpieza de carga pendiente", metadata: { source: "native-portal", type: item.type,
              storageCleanupState: "PENDING", storageCleanupKey: item.storageKey, storageCleanupBytes: item.file.size } } });
        }
      }
      if (cleaned) await reservation.release();
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
