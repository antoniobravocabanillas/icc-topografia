// Keep binary multipart requests comfortably below the hosting gateway limit.
export const PHOTO_REQUEST_LIMIT = 3 * 1024 * 1024;
export const PHOTO_SOURCE_LIMIT = 8 * 1024 * 1024;
const photoTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export function validateWorklogPhotos(files: File[]) {
  if (files.length > 6)
    throw new Error("Puedes adjuntar hasta 6 fotos por bitácora.");
  for (const file of files) {
    if (!photoTypes.has(file.type) || !file.size)
      throw new Error(
        `${file.name}: selecciona una foto JPG, PNG, WEBP o AVIF válida.`,
      );
    if (file.size > PHOTO_SOURCE_LIMIT)
      throw new Error(`${file.name}: supera el máximo de 8 MB por foto.`);
  }
}

export async function prepareWorklogPhoto(file: File): Promise<File> {
  validateWorklogPhotos([file]);
  if (file.size <= PHOTO_REQUEST_LIMIT) return file;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("No se pudo preparar la foto en este navegador.");
    // Only large photos are resized. Small originals are sent unchanged.
    let scale = Math.min(
      1,
      2560 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (blob && blob.size <= PHOTO_REQUEST_LIMIT)
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      scale *= 0.75;
    }
    throw new Error(
      "La foto sigue siendo demasiado grande. Exporta una copia más pequeña.",
    );
  } catch (error) {
    throw new Error(
      `${file.name}: ${error instanceof Error ? error.message : "no se pudo preparar la foto"}`,
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadWorklogPhoto(worklogId: string, file: File) {
  if (file.size > PHOTO_REQUEST_LIMIT)
    throw new Error("La foto necesita optimizarse antes de enviarla.");
  const body = new FormData();
  body.append("photos", file);
  let response: Response;
  try {
    response = await fetch(
      `/api/terraqo/worklog/${encodeURIComponent(worklogId)}/evidence`,
      {
        method: "POST",
        body,
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    throw new Error(
      "Se interrumpió la conexión. Reintenta las fotos pendientes; no se creará otra bitácora.",
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback =
      response.status === 413
        ? "El servidor rechazó el tamaño de la foto. Selecciona una copia más pequeña."
        : response.status === 401
          ? "Tu sesión venció. Inicia sesión de nuevo antes de reintentar."
          : "No pudimos adjuntar esta foto. Reintenta las fotos pendientes.";
    throw new Error(payload?.error?.message || fallback);
  }
  if (!Array.isArray(payload?.data?.media) || !payload.data.media.length)
    throw new Error(
      "No recibimos confirmación de la foto. Reintenta para verificar su guardado.",
    );
}
