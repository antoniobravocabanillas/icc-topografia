import { runEducationCleanupWorker } from "../../lib/terraqo/education-cleanup-job";
import {
  resolveDocumentCleanupSecret,
  resolveScheduledJobTargets,
} from "../../lib/terraqo/scheduled-job-targets";

const cleanupBackground = async (request: Request) => {
  try {
    await runEducationCleanupWorker(request, { fetch, secret: resolveDocumentCleanupSecret(),
      targets: resolveScheduledJobTargets(),
      report: value => console.info("Education cleanup outcome", value) });
  } catch {
    // Provider retries are safe under the durable attempt fences. Never log
    // fetch errors: their request objects can contain operational credentials.
    console.warn("Education cleanup worker requires retry or investigation");
    throw Error("EDUCATION_CLEANUP_RETRY");
  }
};
export default cleanupBackground;
export const config = { background: true, method: "POST" };
