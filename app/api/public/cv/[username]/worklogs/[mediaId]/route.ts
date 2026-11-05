import { prisma } from "@/lib/prisma";
import { getWorklogEvidenceStore } from "@/lib/server/media";

type RouteContext = {
  params: Promise<{ username: string; mediaId: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: RouteContext) {
  const { username, mediaId } = await params;
  const where = {
    id: mediaId,
    worklog: {
      visibility: "PUBLIC" as const,
      deletedAt: null,
      professionalProfile: { username, liveCvEnabled: true }
    }
  };
  const media = await prisma.terraqoWorklogMedia.findFirst({
    where,
    select: {
      storageKey: true,
      fileName: true,
      contentType: true
    }
  });

  if (!media) return new Response("Evidencia no encontrada.", { status: 404 });

  const entry = await getWorklogEvidenceStore().getWithMetadata(media.storageKey, { type: "arrayBuffer" });
  if (!entry) return new Response("La evidencia ya no está disponible.", { status: 404 });

  const stillPublic = await prisma.terraqoWorklogMedia.findFirst({
    where: { ...where, storageKey: media.storageKey }, select: { id: true },
  });
  if (!stillPublic) return new Response("Evidencia no encontrada.", { status: 404 });

  const safeName = media.fileName.replace(/[\r\n"]/g, "-");
  const download = new URL(request.url).searchParams.get("download") === "1";

  return new Response(entry.data, {
    headers: {
      "Content-Type": media.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
      ETag: entry.etag || ""
    }
  });
}
