import sharp from "sharp";

const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_EDGE_PIXELS = 12_000;
const DERIVATIVE_EDGE_PIXELS = 2_560;

const mimeByFormat: Record<string, string> = {
  avif: "image/avif",
  heif: "image/avif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export class WorklogMediaSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorklogMediaSecurityError";
  }
}

export type SanitizedWorklogImage = {
  bytes: Buffer;
  contentType: "image/webp";
  fileName: string;
  sourceFormat: string;
  width: number;
  height: number;
};

function derivativeName(fileName: string) {
  const base = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${base || "evidencia"}.webp`;
}

/**
 * Decodes untrusted image bytes before persistence and emits a normalized
 * derivative without EXIF or embedded profiles. The browser supplied MIME is
 * treated as a claim and must match the decoded format.
 */
export async function sanitizeWorklogEvidenceImage(input: {
  bytes: ArrayBuffer | Buffer;
  claimedContentType: string;
  fileName: string;
}): Promise<SanitizedWorklogImage> {
  const source = Buffer.isBuffer(input.bytes)
    ? input.bytes
    : Buffer.from(input.bytes);
  try {
    const pipeline = sharp(source, {
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    });
    const metadata = await pipeline.metadata();
    const decodedMime = metadata.format ? mimeByFormat[metadata.format] : null;
    if (!decodedMime)
      throw new WorklogMediaSecurityError(
        "El archivo no es una imagen compatible o está dañado.",
      );
    if (decodedMime !== input.claimedContentType)
      throw new WorklogMediaSecurityError(
        "El contenido real de la imagen no coincide con su formato declarado.",
      );
    if (!metadata.width || !metadata.height)
      throw new WorklogMediaSecurityError(
        "No se pudieron verificar las dimensiones de la imagen.",
      );
    if (
      metadata.width > MAX_EDGE_PIXELS ||
      metadata.height > MAX_EDGE_PIXELS ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS
    )
      throw new WorklogMediaSecurityError(
        "La imagen supera la resolución segura permitida.",
      );
    if ((metadata.pages || 1) !== 1)
      throw new WorklogMediaSecurityError(
        "Las imágenes animadas o multipágina no están permitidas como evidencia.",
      );

    const bytes = await sharp(source, {
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: DERIVATIVE_EDGE_PIXELS,
        height: DERIVATIVE_EDGE_PIXELS,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 88, effort: 4, smartSubsample: true })
      .toBuffer();

    return {
      bytes,
      contentType: "image/webp",
      fileName: derivativeName(input.fileName),
      sourceFormat: metadata.format || "unknown",
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    if (error instanceof WorklogMediaSecurityError) throw error;
    throw new WorklogMediaSecurityError(
      "La imagen no pudo superar la verificación de seguridad.",
    );
  }
}
