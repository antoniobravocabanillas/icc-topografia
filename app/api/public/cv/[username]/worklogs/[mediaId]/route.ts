import { sanitizeWorklogEvidenceImage, WorklogMediaSecurityError } from "@/lib/server/worklog-media-security";
import { LEGACY_WORKLOG_IMAGE_TYPES, PUBLIC_WORKLOG_MEDIA_TYPES, publicWorklogFileName } from "@/lib/terraqo/public-worklog-media";
import { standalonePublicWorklogWhere } from "@/lib/terraqo/public-cv";
import { worklogMediaResponse } from "@/lib/server/worklog-media-response";
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
    contentType: { in: PUBLIC_WORKLOG_MEDIA_TYPES },
    worklog: {
      ...standalonePublicWorklogWhere,
      professionalProfile: { username, liveCvEnabled: true }
    }
  };
  const media = await prisma.terraqoWorklogMedia.findFirst({
    where,
    select: {
      storageKey: true,
      contentType: true
    }
  });

  const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (!media) return missing();

  const entry = await getWorklogEvidenceStore().getWithMetadata(media.storageKey, { type: "arrayBuffer" });
  if (!entry) return missing();

  let preview = entry;
  let contentType = media.contentType;
  if (LEGACY_WORKLOG_IMAGE_TYPES.includes(contentType)) {
    try {
      const image = await sanitizeWorklogEvidenceImage({ bytes: entry.data, claimedContentType: contentType, fileName: "evidencia" });
      preview = { ...entry, data: Uint8Array.from(image.bytes).buffer };
      contentType = image.contentType;
    } catch (error) {
      if (error instanceof WorklogMediaSecurityError) return missing();
      throw error;
    }
  }
  const stillPublic = await prisma.terraqoWorklogMedia.findFirst({
    where: { ...where, storageKey: media.storageKey }, select: { id: true },
  });
  if (!stillPublic) return missing();

  return worklogMediaResponse(preview, { contentType, fileName: publicWorklogFileName(contentType) }, request);
}
