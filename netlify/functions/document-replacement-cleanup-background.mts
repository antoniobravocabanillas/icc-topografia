import { runDocumentReplacementCleanupWorker } from "../../lib/terraqo/document-replacement-job";
import { resolveDocumentCleanupSecret, resolveScheduledJobTargets } from "../../lib/terraqo/scheduled-job-targets";

const documentReplacementCleanupBackground = async (request: Request) => {
  if (process.env.TERRAQO_DOCUMENT_LIFECYCLE_V1 !== "true") return;
  try {
    await runDocumentReplacementCleanupWorker(request, { fetch, secret: resolveDocumentCleanupSecret(),
      api: resolveScheduledJobTargets().documentReplacementCleanupApi });
  } catch {
    // Throw a sanitized error so provider retries do not reveal request credentials.
    throw Error("DOCUMENT_REPLACEMENT_CLEANUP_RETRY");
  }
};
export default documentReplacementCleanupBackground;
export const config = { background: true, method: "POST" };
