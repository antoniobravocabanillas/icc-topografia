import { worklogMediaResponse } from "./worklog-media-response";
import { sanitizeWorklogEvidenceImage, WorklogMediaSecurityError } from "./worklog-media-security";
import type { resolveClosureReferenceMedia } from "../terraqo/closure-reference-access";

export const MAX_CLOSURE_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;
type Authorization = Awaited<ReturnType<typeof resolveClosureReferenceMedia>>;
type Dependencies = {
  // Must re-resolve the actor and live policy each time, outside a shared DB snapshot.
  authorize: () => Promise<Authorization>;
  loadBlob: (storageKey: string) => Promise<{ data: ArrayBuffer } | null>;
};
const missing = () => new Response(null, { status: 404, headers: {
  "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff",
} });

/** Never forward provider metadata/ETags or original filenames. A media ID ceiling
 * is not a historical byte hash; a same-key replacement is not immutable evidence. */
export async function closureReferenceMediaResponse(request: Request, dependencies: Dependencies) {
  const before = await dependencies.authorize();
  if (before.contentType !== "image/webp" || before.size <= 0 || before.size > MAX_CLOSURE_REFERENCE_IMAGE_BYTES) return missing();
  const entry = await dependencies.loadBlob(before.storageKey);
  if (!entry || !entry.data.byteLength || entry.data.byteLength > MAX_CLOSURE_REFERENCE_IMAGE_BYTES) return missing();
  let data: ArrayBuffer;
  try {
    const normalized = await sanitizeWorklogEvidenceImage({ bytes: entry.data, claimedContentType: "image/webp", fileName: "evidencia" });
    if (normalized.bytes.byteLength > MAX_CLOSURE_REFERENCE_IMAGE_BYTES) return missing();
    data = Uint8Array.from(normalized.bytes).buffer;
  } catch (error) {
    if (error instanceof WorklogMediaSecurityError) return missing();
    throw error;
  }
  // Await all blob/decoder work before this check. Reapply the saved ceiling as
  // well as the current root, actor, revision and exact storage key.
  const after = await dependencies.authorize();
  if (after.id !== before.id || after.storageKey !== before.storageKey || after.contentType !== before.contentType ||
      after.size !== before.size || after.closureRevisionId !== before.closureRevisionId ||
      after.source.worklogRevisionId !== before.source.worklogRevisionId ||
      after.source.accessKind !== before.source.accessKind || after.source.accessReferenceId !== before.source.accessReferenceId) return missing();
  const response = worklogMediaResponse({ data }, { contentType: "image/webp", fileName: "evidencia.webp" }, request);
  response.headers.set("Vary", "Cookie");
  return response;
}
