// Retry private storage compensation without logging identities, keys or content.
const cleanup = async () => {
  const secret = process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET;
  if (!secret || secret.length < 32) return new Response("Not configured", {status:503});
  const result = await fetch("https://api.terraqoglobal.com/api/internal/professional-document-cleanup", {
    method:"POST", headers:{authorization:`Bearer ${secret}`}, redirect:"error", signal:AbortSignal.timeout(55000),
  });
  return new Response(result.ok ? "Processed" : "Retry required", {status:result.ok ? 200 : 502});
};
export default cleanup;
export const config = {schedule:"*/5 * * * *"};
