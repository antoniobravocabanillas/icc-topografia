import type { PublicationSnapshot } from "@/lib/terraqo/publication-review-policy";

export type OwnerSharingReview = {
  id: string;
  collectionId: string;
  collectionVersion: number;
  workspaceId: string;
  workspace: { name: string };
  requestedByMe: boolean;
  decision: string;
  revokedAt: string | null;
  scopeHash: string;
  snapshotVerified: boolean;
  snapshot: PublicationSnapshot;
  workCaseTarget?: { id: string; version: number };
};
export type ResumableCollection = {
  id: string; version: number; title: string; description: string | null;
  items: Array<{ revisionId?: string; mediaIds?: string[]; allowedFields: string[]; includeMedia: boolean;
    revision: { worklog: { workspaceId?: string | null } } }>;
};
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);

/** Disclosure groups never mix versions, audiences, expiry dates or download rights.
 * Server authorization remains authoritative at mutation time. Incomplete list results
 * (including the review API's pagination limit) deliberately cannot enable confirmation. */
export function persistedSharingGroups(collection: ResumableCollection, reviews: OwnerSharingReview[]) {
  const companies = [...new Set(collection.items.flatMap(item => item.revision.worklog.workspaceId ? [item.revision.worklog.workspaceId] : []))];
  const groups = new Map<string, OwnerSharingReview[]>();
  for (const review of reviews.filter(row => row.requestedByMe && row.collectionId === collection.id)) {
    const snapshot = review.snapshot;
    const key = JSON.stringify([review.collectionVersion, snapshot.destination, snapshot.listOnCv === true,
      snapshot.inviteTarget ? [snapshot.inviteTarget.email, snapshot.inviteTarget.expiresAt, snapshot.inviteTarget.download] : null,
      snapshot.workCaseScope ?? null]);
    groups.set(key, [...(groups.get(key) ?? []), review]);
  }
  return [...groups].map(([key, rows]) => {
    const first = rows[0];
    const snapshot = first.snapshot;
    const invited = snapshot.destination === "INVITED_SELECTION";
    const target = snapshot.inviteTarget;
    const validAudience = invited ? Boolean(target && !snapshot.listOnCv && !snapshot.workCaseScope) : !target;
    const validSnapshots = rows.every(row => {
      const sourceItems = collection.items.filter(item => item.revision.worklog.workspaceId === row.workspaceId);
      return row.snapshotVerified && row.snapshot.collectionId === collection.id && row.snapshot.collectionVersion === row.collectionVersion &&
        row.snapshot.workspaceId === row.workspaceId && row.snapshot.title === collection.title && row.snapshot.description === collection.description &&
        sourceItems.length === row.snapshot.items.length && sourceItems.every(item => {
          const pinned = row.snapshot.items.find(candidate => candidate.revisionId === item.revisionId);
          return pinned && sameSet(Object.keys(pinned.fields), item.allowedFields) && sameSet(pinned.mediaIds, item.includeMedia ? item.mediaIds ?? [] : []);
        });
    });
    const complete = companies.length > 0 && sameSet(rows.map(row => row.workspaceId), companies);
    const sameVersion = first.collectionVersion === collection.version;
    const approved = rows.every(row => row.decision === "APPROVED" && !row.revokedAt);
    const workCase = first.workCaseTarget;
    const validWorkCase = !snapshot.workCaseScope || Boolean(workCase && rows.every(row => row.workCaseTarget?.id === workCase.id && row.workCaseTarget.version === workCase.version));
    const problem = !sameVersion ? "Esta autorización corresponde a otra versión. No se puede aplicar a la selección actual."
      : !complete ? "Faltan autorizaciones del mismo destino y versión para todas las empresas."
      : !validAudience || !validSnapshots || !validWorkCase ? "El destino o el alcance persistido no coincide con la selección actual. Revisa las autorizaciones."
      : !approved ? "Todas las empresas deben aprobar este destino. Hay decisiones pendientes, rechazadas o revocadas."
      : "Todas las empresas aprobaron este destino y versión. Confirma para aplicar los permisos exactos.";
    return { key, rows, version: first.collectionVersion, invited, target, listOnCv: snapshot.listOnCv === true, workCase,
      ready: sameVersion && complete && validAudience && validSnapshots && validWorkCase && approved, problem };
  });
}

/** A valid UUID derived from the persisted disclosure, stable across reloads and
 * independent sessions. A retry cannot quietly acquire a different request key. */
export async function persistedConfirmationKey(collectionId: string, version: number, reviews: OwnerSharingReview[]) {
  const bytes = new TextEncoder().encode(JSON.stringify(["s06-owner-confirm", collectionId, version, reviews.map(row => [row.id, row.scopeHash]).sort()]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  digest[6] = (digest[6] & 15) | 80;
  digest[8] = (digest[8] & 63) | 128;
  const hex = [...digest.slice(0, 16)].map(value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
