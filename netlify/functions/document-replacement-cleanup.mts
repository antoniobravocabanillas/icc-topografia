import { queueDocumentReplacementCleanup } from "../../lib/terraqo/document-replacement-job";
import { resolveDocumentCleanupSecret, resolveScheduledJobTargets } from "../../lib/terraqo/scheduled-job-targets";

const scheduledDocumentReplacementCleanup = async () => {
  if (process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1 !== "true") return new Response(null, { status: 204 });
  try {
    await queueDocumentReplacementCleanup({ fetch, secret: resolveDocumentCleanupSecret(),
      worker: resolveScheduledJobTargets().documentReplacementCleanupWorker });
    return new Response("Queued", { status: 200 });
  } catch {
    console.warn("Document replacement cleanup queue unavailable");
    return new Response("Queue unavailable", { status: 503 });
  }
};
export default scheduledDocumentReplacementCleanup;
export const config = { schedule: "*/5 * * * *" };
