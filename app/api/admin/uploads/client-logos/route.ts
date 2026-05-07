import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/utils";
import { fail, handleApiError } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import {
  ALLOWED_CLIENT_LOGO_TYPES,
  createClientLogoKey,
  getClientLogoStore,
  MAX_CLIENT_LOGO_SIZE
} from "@/lib/server/media";

export async function POST(request: Request) {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);

    if (!files.length) return fail("No se recibieron logos.", 400);
    if (files.length > 6) return fail("Puedes subir hasta 6 logos por carga.", 400);

    const store = getClientLogoStore();
    const uploadedLogos = [];

    for (const file of files) {
      if (!ALLOWED_CLIENT_LOGO_TYPES.has(file.type)) {
        return fail(`Formato no permitido: ${file.name}. Usa SVG, JPG, PNG, WebP o AVIF.`, 400);
      }

      if (file.size > MAX_CLIENT_LOGO_SIZE) {
        return fail(`El logo ${file.name} supera el limite de 3 MB.`, 400);
      }

      const key = createClientLogoKey(file.name);
      await store.set(key, await file.arrayBuffer(), {
        metadata: {
          contentType: file.type,
          originalName: file.name,
          size: file.size,
          uploadedAt: new Date().toISOString()
        }
      });

      uploadedLogos.push({
        key,
        url: absoluteUrl(`/api/media/${key}`),
        contentType: file.type,
        fileName: file.name,
        size: file.size
      });
    }

    return NextResponse.json({ logos: uploadedLogos });
  } catch (error) {
    return handleApiError(error);
  }
}
