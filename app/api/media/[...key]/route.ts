import { fail, handleApiError } from "@/lib/server/api";
import { CLIENT_LOGO_PREFIX, CUSTOMER_FILE_PREFIX, getClientLogoStore, getCustomerFileStore, getProductMediaStore, getProfessionalAvatarStore, getProjectMediaStore, PRODUCT_IMAGE_PREFIX, PROFESSIONAL_AVATAR_PREFIX, PROJECT_IMAGE_PREFIX } from "@/lib/server/media";

type MediaRouteProps = {
  params: Promise<{ key: string[] }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, { params }: MediaRouteProps) {
  try {
    const { key: keyParts } = await params;
    const key = keyParts.join("/");

    if (!key.startsWith(`${PRODUCT_IMAGE_PREFIX}/`) && !key.startsWith(`${CUSTOMER_FILE_PREFIX}/`) && !key.startsWith(`${CLIENT_LOGO_PREFIX}/`) && !key.startsWith(`${PROJECT_IMAGE_PREFIX}/`) && !key.startsWith(`${PROFESSIONAL_AVATAR_PREFIX}/`)) {
      return fail("Archivo no permitido", 403);
    }

    const store = key.startsWith(`${PROFESSIONAL_AVATAR_PREFIX}/`)
      ? getProfessionalAvatarStore()
      : key.startsWith(`${CUSTOMER_FILE_PREFIX}/`)
      ? getCustomerFileStore()
      : key.startsWith(`${CLIENT_LOGO_PREFIX}/`)
        ? getClientLogoStore()
        : key.startsWith(`${PROJECT_IMAGE_PREFIX}/`)
          ? getProjectMediaStore()
          : getProductMediaStore();
    const entry = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!entry) return fail("Archivo no encontrado", 404);

    const contentType = typeof entry.metadata.contentType === "string" ? entry.metadata.contentType : "application/octet-stream";

    return new Response(entry.data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: entry.etag || ""
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
