import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/utils";
import { fail, handleApiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import {
  ALLOWED_CLIENT_LOGO_TYPES,
  createServiceIconKey,
  getClientLogoStore,
  MAX_CLIENT_LOGO_SIZE
} from "@/lib/server/media";

export async function POST(request: Request) {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) return fail("No se recibio icono.", 400);
    if (!ALLOWED_CLIENT_LOGO_TYPES.has(file.type)) {
      return fail(`Formato no permitido: ${file.name}. Usa SVG, JPG, PNG, WebP o AVIF.`, 400);
    }
    if (file.size > MAX_CLIENT_LOGO_SIZE) {
      return fail(`El icono ${file.name} supera el limite de 3 MB.`, 400);
    }

    const store = getClientLogoStore();
    const key = createServiceIconKey(file.name);
    await store.set(key, await file.arrayBuffer(), {
      metadata: {
        contentType: file.type,
        originalName: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString()
      }
    });

    return NextResponse.json({
      icon: {
        key,
        url: absoluteUrl(`/api/media/${key}`),
        contentType: file.type,
        fileName: file.name,
        size: file.size
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
