import { prisma } from "@/lib/prisma";
import { getWorklogEvidenceStore } from "@/lib/server/media";
import { publicWorkCase } from "@/lib/terraqo/public-work-case";

export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  {
    params,
  }: {
    params: Promise<{ username: string; slug: string; mediaId: string }>;
  },
) {
  const { username, slug, mediaId } = await params;
  const missing = () =>
    new Response(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  async function permitted() {
    const work = await publicWorkCase(username, slug);
    return work?.items.some((item) =>
      item.media.some((media) => media.id === mediaId),
    );
  }
  if (!(await permitted())) return missing();
  const media = await prisma.terraqoWorklogMedia.findFirst({
    where: { id: mediaId, contentType: "image/webp" },
    select: { storageKey: true },
  });
  if (!media) return missing();
  const entry = await getWorklogEvidenceStore().getWithMetadata(
    media.storageKey,
    { type: "arrayBuffer" },
  );
  if (!entry || !(await permitted())) return missing();
  // The projection includes these pixels, not the owner's source filename.
  return new Response(entry.data, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
