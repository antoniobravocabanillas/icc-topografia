// Retry private storage compensation without logging identities, keys or content.
const cleanup = async () => {
  const secret = process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET;
  if (!secret || secret.length < 32) return new Response("Not configured", {status:503});
  const result = await fetch("https://api.terraqoglobal.com/api/internal/professional-document-cleanup", {
    method:"POST", headers:{authorization:`Bearer ${secret}`}, redirect:"error", signal:AbortSignal.timeout(55000),
  });
  if (result.ok) {
    const counters = await result.json();
    const fields=["completed","retry","blocked","skipped"] as const;
    if(fields.some(field=>!Number.isSafeInteger(counters[field])||counters[field]<0))return new Response("Invalid cleanup response",{status:502});
    console.info("Private cleanup counters", {completed:counters.completed,retry:counters.retry,blocked:counters.blocked,skipped:counters.skipped});
    const health=counters.backlog;
    if(!health || ["pending","blocked","overdue","orphaned"].some(field=>!Number.isSafeInteger(health[field])||health[field]<0))return new Response("Cleanup health unavailable",{status:502});
    const backlog={pending:health.pending,blocked:health.blocked,overdue:health.overdue,orphaned:health.orphaned};
    if(backlog.blocked || backlog.overdue || backlog.orphaned)console.warn("Private cleanup requires investigation",backlog);
    else console.info("Private cleanup backlog",backlog);
  }
  return new Response(result.ok ? "Processed" : "Retry required", {status:result.ok ? 200 : 502});
};
export default cleanup;
export const config = {schedule:"*/5 * * * *"};
