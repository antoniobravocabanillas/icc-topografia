import { getStore } from "@netlify/blobs";

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
export const SERVICE_ICON_PREFIX = "service-icons";
export const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_CUSTOMER_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_CLIENT_LOGO_SIZE = 3 * 1024 * 1024;
export const MAX_PROJECT_IMAGE_SIZE = 8 * 1024 * 1024;
export const MAX_PROFESSIONAL_DOCUMENT_SIZE = 10 * 1024 * 1024;
export const ALLOWED_PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
export const ALLOWED_CLIENT_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/svg+xml"]);
export const ALLOWED_PROJECT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
export const ALLOWED_CUSTOMER_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/pdf"
]);
export const ALLOWED_CV_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);
export const ALLOWED_IDENTITY_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

export function getProductMediaStore() {
  return getStore(PRODUCT_IMAGE_STORE);
}

export function getCustomerFileStore() {
  return getStore(CUSTOMER_FILE_STORE);
}

export function getClientLogoStore() {
  return getStore(CLIENT_LOGO_STORE);
}

export function getProjectMediaStore() {
  return getStore(PROJECT_IMAGE_STORE);
}

export function getProfessionalDocumentStore() {
  return getStore(PROFESSIONAL_DOCUMENT_STORE);
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

export function createProfessionalDocumentKey(profileId: string, type: string, fileName: string) {
  const safeName = sanitizeFileName(fileName) || "documento";
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "bin";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  return `${PROFESSIONAL_DOCUMENT_PREFIX}/${profileId}/${type.toLowerCase()}/${crypto.randomUUID()}-${baseName}.${extension}`;
}
