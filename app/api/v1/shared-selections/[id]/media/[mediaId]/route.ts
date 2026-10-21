import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/authz";
import { getWorklogEvidenceStore } from "@/lib/server/media";

type Context = { params: Promise<{ id: string; mediaId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: Context) {
  if (process.env.TERRAQO_SCOPED_SHARING_V1 !== "true")
    return new Response("Recurso no disponible.", { status: 404 });
  const { response, session } = await requireUser();
  if (response) return response;
  const { id, mediaId } = await params;
  const now = new Date();
  const download = new URL(request.url).searchParams.get("download") === "1";
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
                collectionId: id,
                collection: {
                  grants: {
                    some: {
                      lifecycle: "ACTIVE",
                      revokedAt: null,
                      expiresAt: { gt: now },
                      scopes: { has: download ? "DOWNLOAD_MEDIA" : "VIEW_COLLECTION" },
                      OR: [
                        { subjectUserId: session.user.id },
                        { subjectUserId: null, inviteEmail: session.user.email.toLowerCase() },
                      ],
                    },
                  },
                },
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
  return new Response(entry.data, {
    headers: {
      "Content-Type": media.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${media.fileName.replace(/[\r\n"]/g, "-")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
