import { queueEducationCleanup } from "../../lib/terraqo/education-cleanup-job";
import { resolveScheduledJobTargets } from "../../lib/terraqo/scheduled-job-targets";

// Scheduled Functions have 30 seconds. Only the bounded invocation request
// runs here; storage/SQL work belongs to the authenticated background worker.
const scheduledCleanup = async () => {
  try {
    await queueEducationCleanup({ fetch, secret: process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET,
      targets: resolveScheduledJobTargets(),
      report: value => console.info("Education cleanup invocation", value) });
    return new Response("Queued", { status: 200 });
  } catch {
    console.warn("Education cleanup invocation unavailable");
    return new Response("Queue unavailable", { status: 503 });
  }
};
export default scheduledCleanup;
export const config = { schedule: "*/5 * * * *" };
