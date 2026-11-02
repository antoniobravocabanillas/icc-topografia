import { requireUser } from "@/lib/server/authz";
import { fail, handleApiError } from "@/lib/server/api";
import { getWorklogEvidenceStore } from "@/lib/server/media";
import {
  getPublicationReviewMedia,
  publicationReviewEnabled,
  PublicationReviewError,
} from "@/lib/terraqo/publication-review";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ reviewId: string; mediaId: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (!publicationReviewEnabled()) return fail("Recurso no disponible.", 404);
  const { session, response } = await requireUser();
  if (response) return response;
  try {
    const { reviewId, mediaId } = await params;
    if (![reviewId, mediaId].every((id) => /^[a-zA-Z0-9_-]{1,80}$/.test(id)))
      return fail("Recurso no disponible.", 404);
    const media = await getPublicationReviewMedia({
      userId: session.user.id,
      reviewId,
      mediaId,
    });
    const entry = await getWorklogEvidenceStore().getWithMetadata(
      media.storageKey,
      { type: "arrayBuffer" },
    );
    if (!entry) return fail("Recurso no disponible.", 404);
    // Recheck after storage I/O to catch revocation while the blob was loading.
    await getPublicationReviewMedia({
      userId: session.user.id,
      reviewId,
      mediaId,
    });
    return new Response(entry.data, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    if (error instanceof PublicationReviewError)
      return fail(error.message, error.status);
    return handleApiError(error);
  }
}
