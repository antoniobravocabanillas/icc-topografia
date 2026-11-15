import { ScopedSharingConsole } from "@/components/terraqo/scoped-sharing-console";
import type { OwnerSharingReview } from "@/components/terraqo/persisted-sharing-review";

// Synthetic server-side data, deliberately independent of all browser storage.
const expiry = new Date(Date.now() + 7 * 86_400_000).toISOString().replace(/\d{3}Z$/, "123Z");
export default async function PersistedSharingFixture({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state = "invited" } = await searchParams;
  const publicDestination = state === "public" || state === "public-pending";
  const items = ["company-a", "company-b"].map((workspaceId, index) => ({
    id: `item-${index}`, revisionId: `revision-${index}`, mediaIds: [`media-${index}`],
    allowedFields: ["summary"], includeMedia: true,
    revision: { title: `Registro ${index}`, worklog: { workspaceId, media: [{ id: `media-${index}` }] } },
  }));
  const reviews: OwnerSharingReview[] = items.map((item, index) => ({
    id: `review-${index}`, collectionId: "persisted-collection", collectionVersion: 4,
    workspaceId: item.revision.worklog.workspaceId, workspace: { name: `Empresa ${index + 1}` },
    requestedByMe: true, decision: "APPROVED", revokedAt: null, scopeHash: `hash-${index}`, snapshotVerified: true,
    snapshot: { policy: "enterprise-publication-v1", destination: publicDestination ? "PUBLIC_SELECTION" : "INVITED_SELECTION",
      ...(publicDestination ? { listOnCv: true as const } : { inviteTarget: { email: "destino@example.com", expiresAt: state === "expired" ? "2020-01-01T17:42:19.123Z" : expiry, download: state === "download" } }),
      collectionId: "persisted-collection", collectionVersion: 4, workspaceId: item.revision.worklog.workspaceId,
      title: "Selección persistida", description: null,
      items: [{ revisionId: item.revisionId, revisionNo: 1, contentHash: "fixture-content", worklogId: `record-${index}`, fields: { summary: `Descripción ${index}` }, mediaIds: item.mediaIds }],
    },
  }));
  if (state === "pending" || state === "public-pending") reviews[1].decision = "PENDING";
  if (state === "declined") reviews[1].decision = "DECLINED";
  if (state === "revoked") reviews[1].revokedAt = "2026-01-01T00:00:00.000Z";
  if (state === "foreign") reviews[1].requestedByMe = false;
  if (state === "missing") reviews.pop();
  if (state === "duplicate") reviews.push({ ...reviews[0], id: "duplicate" });
  if (state === "invalid-hash") reviews[1].snapshotVerified = false;
  if (state === "wrong-fields") reviews[1].snapshot.items[0].fields = { title: "No autorizado" };
  if (state === "wrong-media") reviews[1].snapshot.items[0].mediaIds = ["unselected-media"];
  if (state === "wrong-email") reviews[1].snapshot.inviteTarget!.email = "otro@example.com";
  if (state === "wrong-expiry") reviews[1].snapshot.inviteTarget!.expiresAt = new Date(Date.parse(expiry) + 1).toISOString();
  if (state === "wrong-download") reviews[1].snapshot.inviteTarget!.download = true;
  if (state === "wrong-version") { reviews[1].collectionVersion = 3; reviews[1].snapshot.collectionVersion = 3; }
  if (state === "wrong-destination") { reviews[1].snapshot.destination = "PUBLIC_SELECTION"; reviews[1].snapshot.listOnCv = true; delete reviews[1].snapshot.inviteTarget; }
  return <main className="mx-auto max-w-7xl p-4"><ScopedSharingConsole candidates={[]} publicationReviewEnabled ownerReviews={reviews}
    collections={[{ id: "persisted-collection", title: "Selección persistida", description: null, version: state === "stale" ? 5 : 4, items, grants: [], publicProjection: null }]} /></main>;
}
