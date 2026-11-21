import { prisma } from "@/lib/prisma";
import { dispatchDocumentReplacementCleanup } from "@/lib/server/document-replacement-cleanup";
import { getProfessionalDocumentStore } from "@/lib/server/media";
import { documentReplacementJobAuthorized } from "@/lib/terraqo/document-replacement-job";
import { resolveDocumentCleanupSecret, resolveScheduledJobTargets } from "@/lib/terraqo/scheduled-job-targets";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1 !== "true") return json({ error: "Unavailable" }, 404);
  if (!documentReplacementJobAuthorized(request, resolveDocumentCleanupSecret())) return json({ error: "Unauthorized" }, 401);
  try {
    // Validate deployment isolation even when someone invokes the API directly.
    resolveScheduledJobTargets();
    const counts = await dispatchDocumentReplacementCleanup(prisma, getProfessionalDocumentStore());
    console.info("Document replacement cleanup", counts);
    return json(counts, 200);
  } catch {
    // No keys, credentials, object paths or private metadata in operational logs.
    console.warn("Document replacement cleanup requires retry");
    return json({ error: "Retry required" }, 503);
  }
}
