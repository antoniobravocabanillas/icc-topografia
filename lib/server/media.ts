import { getStore } from "@netlify/blobs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type MediaMetadata = Record<string, unknown>;

type MediaStore = {
  set: (
    key: string,
    data: ArrayBuffer,
    options?: { metadata?: MediaMetadata },
  ) => Promise<unknown>;
  getWithMetadata: (
    key: string,
    options: { type: "arrayBuffer" },
  ) => Promise<{
    data: ArrayBuffer;
    metadata: MediaMetadata;
    etag?: string;
  } | null>;
  delete: (key: string) => Promise<unknown>;
};

class LocalMediaStore implements MediaStore {
  private readonly root: string;

  constructor(storeName: string) {
    this.root = path.resolve(process.cwd(), ".next", "local-media", storeName);
  }

  private resolveKey(key: string) {
    const filePath = path.resolve(this.root, key);
    if (!filePath.startsWith(`${this.root}${path.sep}`))
      throw new Error("Ruta de archivo no permitida.");
    return filePath;
  }

  async set(
    key: string,
    data: ArrayBuffer,
    options?: { metadata?: MediaMetadata },
  ) {
    const filePath = this.resolveKey(key);
    const metadataPath = `${filePath}.metadata.json`;
    const etag = crypto.randomUUID();
    await mkdir(path.dirname(filePath), { recursive: true });
    await Promise.all([
      writeFile(filePath, Buffer.from(data)),
      writeFile(
        metadataPath,
        JSON.stringify({ metadata: options?.metadata || {}, etag }),
        "utf8",
      ),
    ]);
    return { etag };
  }

  async getWithMetadata(key: string, options: { type: "arrayBuffer" }) {
    void options;
    const filePath = this.resolveKey(key);
    try {
      const [data, storedMetadata] = await Promise.all([
        readFile(filePath),
        readFile(`${filePath}.metadata.json`, "utf8").catch(() => "{}"),
      ]);
      const parsed = JSON.parse(storedMetadata) as {
        metadata?: MediaMetadata;
        etag?: string;
      };
      return {
        data: Uint8Array.from(data).buffer,
        metadata: parsed.metadata || {},
        etag: parsed.etag,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string) {
    const filePath = this.resolveKey(key);
    await Promise.all([
      rm(filePath, { force: true }),
      rm(`${filePath}.metadata.json`, { force: true }),
    ]);
  }
}

function getMediaStore(storeName: string): MediaStore {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NETLIFY !== "true"
  ) {
    return new LocalMediaStore(storeName);
  }
  return getStore(storeName) as MediaStore;
}

export const PRODUCT_IMAGE_STORE = "icc-product-media";
export const PRODUCT_IMAGE_PREFIX = "product-images";
export const CUSTOMER_FILE_STORE = "icc-customer-files";
export const CUSTOMER_FILE_PREFIX = "customer-files";
export const CLIENT_LOGO_STORE = "icc-client-logos";
export const CLIENT_LOGO_PREFIX = "client-logos";
export const PROJECT_IMAGE_STORE = "icc-project-media";
export const PROJECT_IMAGE_PREFIX = "project-images";
export const PROFESSIONAL_DOCUMENT_STORE = "terraqo-professional-documents";
export const PROFESSIONAL_DOCUMENT_PREFIX = "professional-documents";
export const PROFESSIONAL_AVATAR_STORE = "terraqo-professional-avatars";
export const PROFESSIONAL_AVATAR_PREFIX = "professional-avatars";
export const WORKLOG_EVIDENCE_STORE = "terraqo-worklog-evidence";
export const WORKLOG_EVIDENCE_PREFIX = "worklog-evidence";
export const EXPERIENCE_EVIDENCE_PREFIX = "experience-evidence";
export const WORKSPACE_FILE_STORE = "terraqo-workspace-files";
export const WORKSPACE_FILE_PREFIX = "workspace-files";
export const MESSAGE_ATTACHMENT_STORE = "terraqo-message-attachments";
export const MESSAGE_ATTACHMENT_PREFIX = "message-attachments";
export const SERVICE_ICON_PREFIX = "service-icons";
export const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_CUSTOMER_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_CLIENT_LOGO_SIZE = 3 * 1024 * 1024;
export const MAX_PROJECT_IMAGE_SIZE = 8 * 1024 * 1024;
export const MAX_PROFESSIONAL_DOCUMENT_SIZE = 10 * 1024 * 1024;
export const MAX_PROFESSIONAL_AVATAR_SIZE = 3 * 1024 * 1024;
export const MAX_WORKLOG_EVIDENCE_SIZE = 8 * 1024 * 1024;
export const MAX_EXPERIENCE_EVIDENCE_SIZE = 8 * 1024 * 1024;
export const MAX_WORKSPACE_FILE_SIZE = 35 * 1024 * 1024;
export const MAX_MESSAGE_ATTACHMENT_SIZE = 20 * 1024 * 1024;
export const ALLOWED_PRODUCT_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
export const ALLOWED_CLIENT_LOGO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/svg+xml",
]);
export const ALLOWED_PROJECT_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
export const ALLOWED_CUSTOMER_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/pdf",
]);
export const ALLOWED_CV_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export const ALLOWED_IDENTITY_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
export const ALLOWED_PRIVATE_DOCUMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
export const ALLOWED_PROFESSIONAL_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
export const ALLOWED_WORKLOG_EVIDENCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
export const ALLOWED_EXPERIENCE_EVIDENCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/pdf",
]);
export const ALLOWED_WORKSPACE_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/acad",
  "application/x-acad",
  "application/dwg",
  "image/vnd.dwg",
  "application/dxf",
  "image/vnd.dxf",
  "application/octet-stream",
]);
export const ALLOWED_MESSAGE_ATTACHMENT_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]);

export function getProductMediaStore() {
  return getMediaStore(PRODUCT_IMAGE_STORE);
}

export function getCustomerFileStore() {
  return getMediaStore(CUSTOMER_FILE_STORE);
}

export function getClientLogoStore() {
  return getMediaStore(CLIENT_LOGO_STORE);
}

export function getProjectMediaStore() {
  return getMediaStore(PROJECT_IMAGE_STORE);
}

export function getProfessionalDocumentStore() {
  return getMediaStore(PROFESSIONAL_DOCUMENT_STORE);
}

export function getProfessionalAvatarStore() {
  return getMediaStore(PROFESSIONAL_AVATAR_STORE);
}

export function getWorklogEvidenceStore() {
  return getMediaStore(WORKLOG_EVIDENCE_STORE);
}

export function getWorkspaceFileStore() {
  return getMediaStore(WORKSPACE_FILE_STORE);
}

export function getMessageAttachmentStore() {
  return getMediaStore(MESSAGE_ATTACHMENT_STORE);
}

export function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function createProductImageKey(fileName: string) {
  const safeName = sanitizeFileName(fileName) || "producto";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "jpg";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  return `${PRODUCT_IMAGE_PREFIX}/${crypto.randomUUID()}-${baseName}.${extension}`;
}

export function createCustomerFileKey(fileName: string) {
  const safeName = sanitizeFileName(fileName) || "archivo";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "bin";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  return `${CUSTOMER_FILE_PREFIX}/${crypto.randomUUID()}-${baseName}.${extension}`;
}

export function createClientLogoKey(fileName: string) {
  const safeName = sanitizeFileName(fileName) || "cliente";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "png";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  return `${CLIENT_LOGO_PREFIX}/${crypto.randomUUID()}-${baseName}.${extension}`;
}

export function createProjectImageKey(fileName: string) {
  const safeName = sanitizeFileName(fileName) || "proyecto";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "jpg";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  return `${PROJECT_IMAGE_PREFIX}/${crypto.randomUUID()}-${baseName}.${extension}`;
}

export function createServiceIconKey(fileName: string) {
  const safeName = sanitizeFileName(fileName) || "servicio";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "svg";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  return `${SERVICE_ICON_PREFIX}/${crypto.randomUUID()}-${baseName}.${extension}`;
}

export function createProfessionalDocumentKey(
  profileId: string,
  type: string,
  fileName: string,
) {
  const safeName = sanitizeFileName(fileName) || "documento";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "bin";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  return `${PROFESSIONAL_DOCUMENT_PREFIX}/${profileId}/${type.toLowerCase()}/${crypto.randomUUID()}-${baseName}.${extension}`;
}

export function createProfessionalAvatarKey(userId: string, fileName: string) {
  const safeName = sanitizeFileName(fileName) || "avatar";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "jpg";
  return `${PROFESSIONAL_AVATAR_PREFIX}/${userId}/${crypto.randomUUID()}.${extension}`;
}

export function createWorklogEvidenceKey(worklogId: string, fileName: string) {
  const safeName = sanitizeFileName(fileName) || "evidencia";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "jpg";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  return `${WORKLOG_EVIDENCE_PREFIX}/${worklogId}/${crypto.randomUUID()}-${baseName}.${extension}`;
}

export function createExperienceEvidenceKey(
  experienceId: string,
  fileName: string,
) {
  const safeName = sanitizeFileName(fileName) || "evidencia";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "bin";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  return `${EXPERIENCE_EVIDENCE_PREFIX}/${experienceId}/${crypto.randomUUID()}-${baseName}.${extension}`;
}

export function createWorkspaceFileKey(
  workspaceId: string,
  userId: string,
  fileName: string,
) {
  const safeName = sanitizeFileName(fileName) || "archivo";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "bin";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  return `${WORKSPACE_FILE_PREFIX}/${workspaceId}/${userId}/${crypto.randomUUID()}-${baseName}.${extension}`;
}

export function createMessageAttachmentKey(
  conversationId: string,
  fileName: string,
) {
  const safeName = sanitizeFileName(fileName) || "archivo";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "bin";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  return `${MESSAGE_ATTACHMENT_PREFIX}/${conversationId}/${crypto.randomUUID()}-${baseName}.${extension}`;
}
