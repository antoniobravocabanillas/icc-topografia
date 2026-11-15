import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { selectionGrantForUser } from "@/lib/terraqo/scoped-sharing";
import { getWorklogEvidenceStore } from "@/lib/server/media";

type Context = { params: Promise<{ id: string; mediaId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: Context) {
  if (process.env.TERRAQO_SCOPED_SHARING_V1 !== "true")
    return new Response("Recurso no disponible.", { status: 404 });
  const session = await auth();
  if (!session?.user?.id) return new Response("Inicia sesión.", { status: 401 });
  const { id, mediaId } = await params;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const permittedMedia = async () => prisma.terraqoWorklogMedia.findFirst({
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
                collectionId: id,
                collection: {
                  lifecycle: { not: "ARCHIVED" },
                  grants: { some: await selectionGrantForUser(session.user.id, id, download) },
                },
              },
            },
          },
        },
      },
    },
    select: { storageKey: true, fileName: true, contentType: true },
  });
  const media = await permittedMedia();
  if (!media) return new Response("Evidencia no encontrada.", { status: 404 });
  const entry = await getWorklogEvidenceStore().getWithMetadata(media.storageKey, { type: "arrayBuffer" });
  if (!entry) return new Response("La evidencia ya no está disponible.", { status: 404 });
  // The grant or item can be withdrawn while storage I/O is pending.
  // Bind the loaded bytes to the still-authorized object on the second read.
  if ((await permittedMedia())?.storageKey !== media.storageKey)
    return new Response("Evidencia no encontrada.", { status: 404 });
  return new Response(entry.data, {
    headers: {
      "Content-Type": media.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${media.fileName.replace(/[\r\n"]/g, "-")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
