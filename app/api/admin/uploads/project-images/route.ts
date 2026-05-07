import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/utils";
import { fail, handleApiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import {
  ALLOWED_PROJECT_IMAGE_TYPES,
  createProjectImageKey,
  getProjectMediaStore,
  MAX_PROJECT_IMAGE_SIZE
} from "@/lib/server/media";

export async function POST(request: Request) {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);

    if (!files.length) return fail("No se recibieron imagenes.", 400);
    if (files.length > 10) return fail("Puedes subir hasta 10 imagenes por carga.", 400);

    const store = getProjectMediaStore();
    const uploadedImages = [];

    for (const file of files) {
      if (!ALLOWED_PROJECT_IMAGE_TYPES.has(file.type)) {
        return fail(`Formato no permitido: ${file.name}. Usa JPG, PNG, WebP o AVIF.`, 400);
      }

      if (file.size > MAX_PROJECT_IMAGE_SIZE) {
        return fail(`La imagen ${file.name} supera el limite de 8 MB.`, 400);
      }

      const key = createProjectImageKey(file.name);
      await store.set(key, await file.arrayBuffer(), {
        metadata: {
          contentType: file.type,
          originalName: file.name,
          size: file.size,
          uploadedAt: new Date().toISOString()
        }
      });

      uploadedImages.push({
        key,
        url: absoluteUrl(`/api/media/${key}`),
        contentType: file.type,
        fileName: file.name,
        size: file.size
      });
    }

    return NextResponse.json({ images: uploadedImages });
  } catch (error) {
    return handleApiError(error);
  }
}
