import { WORKLOG_CLIP_TYPES } from "./worklog-clip-types";

// Historical photos are converted to the same metadata-free preview when read.
export const LEGACY_WORKLOG_IMAGE_TYPES = ["image/jpeg", "image/png", "image/avif"];
export const PUBLIC_WORKLOG_MEDIA_TYPES = ["image/webp", ...WORKLOG_CLIP_TYPES, ...LEGACY_WORKLOG_IMAGE_TYPES];

export function publicWorklogFileName(contentType: string) {
  if (LEGACY_WORKLOG_IMAGE_TYPES.includes(contentType)) return "evidencia.webp";
  const extension = contentType.split("/")[1];
  return PUBLIC_WORKLOG_MEDIA_TYPES.includes(contentType) ? `evidencia.${extension}` : "evidencia";
}
