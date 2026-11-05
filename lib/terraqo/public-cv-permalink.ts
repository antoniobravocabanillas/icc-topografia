const SYNTHETIC_RECORD_PREFIXES = [
  "experience-",
  "education-",
  "document-",
  "project-",
] as const;

const SAFE_RECORD_ID = /^[A-Za-z0-9._~-]{1,160}$/;

function safeRecordId(value: string | null | undefined) {
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const normalized = decoded.trim();
  return SAFE_RECORD_ID.test(normalized) ? normalized : null;
}

export function isSyntheticPublicCvRecordId(recordId: string) {
  return SYNTHETIC_RECORD_PREFIXES.some((prefix) => recordId.startsWith(prefix));
}

export function requestedPublicCvRecordId(input: {
  search: string;
  hash: string;
  pathname?: string;
}) {
  const pathMatch = input.pathname?.match(/\/evidencias\/([^/?#]+)\/?$/);
  const pathId = safeRecordId(pathMatch?.[1]);
  if (pathId) return pathId;
  const queryId = safeRecordId(
    new URLSearchParams(input.search).get("registro"),
  );
  if (queryId) return queryId;
  return safeRecordId(input.hash.replace(/^#/, ""));
}

export function publicCvEvidenceHref(username: string, recordId: string) {
  const profilePath = `/cv/${encodeURIComponent(username)}/evidencias`;
  if (isSyntheticPublicCvRecordId(recordId)) {
    return `${profilePath}?registro=${encodeURIComponent(recordId)}`;
  }
  return `${profilePath}/${encodeURIComponent(recordId)}`;
}

export function publicWorkCaseListHref(username: string) {
  return `/cv/${encodeURIComponent(username)}/trabajos`;
}

export function publicWorkCaseHref(username: string, slug: string) {
  return `${publicWorkCaseListHref(username)}/${encodeURIComponent(slug)}`;
}

export function publicCaseRecordHref(username: string, slug: string, recordId: string, revisionId: string) {
  const context = new URLSearchParams({ trabajo: slug, revision: revisionId });
  return `/cv/${encodeURIComponent(username)}/evidencias/${encodeURIComponent(recordId)}?${context}`;
}
