import { prisma } from "@/lib/prisma";
import { getWorklogEvidenceStore } from "@/lib/server/media";

type Context = { params: Promise<{ slug: string; mediaId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: Context) {
  if (process.env.TERRAQO_SCOPED_SHARING_V1 !== "true")
    return new Response("Recurso no disponible.", { status: 404 });
  const { slug, mediaId } = await params;
  const media = await prisma.terraqoWorklogMedia.findFirst({
    where: {
      id: mediaId,
      contentType: "image/webp",
      worklog: {
        deletedAt: null,
        revisions: {
          some: {
            shareItems: {
              some: {
                includeMedia: true,
                mediaIds: { has: mediaId },
                collection: { publicProjection: { slug, revokedAt: null } },
              },
            },
          },
        },
      },
    },
    select: { storageKey: true, fileName: true, contentType: true },
  });
  if (!media) return new Response("Evidencia no encontrada.", { status: 404 });
  const entry = await getWorklogEvidenceStore().getWithMetadata(media.storageKey, { type: "arrayBuffer" });
  if (!entry) return new Response("La evidencia ya no está disponible.", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const safeName = media.fileName.replace(/[\r\n"]/g, "-");
  return new Response(entry.data, {
    headers: {
      "Content-Type": media.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, max-age=60, no-transform",
      "X-Content-Type-Options": "nosniff",
      ETag: entry.etag || "",
    },
  });
}
