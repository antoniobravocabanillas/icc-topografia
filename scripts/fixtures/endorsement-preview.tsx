import { EndorsementConsole, type EndorsementRequestItem } from "@/components/terraqo/endorsement-console";
const revision = { id: "revision-one", revisionNo: 1, contentHash: "synthetic-hash", title: "Título reservado", summary: "Descripción solicitada", tools: ["Estación total"], thumbnailMediaId: "owner-media", worklog: { id: "worklog-one" } };
const base: EndorsementRequestItem = {
  id: "draft-one", requesterId: "owner", reviewerUserId: null, reviewerEmail: "reviewer@example.com",
  relationshipLabel: "Supervisor", requestedScope: ["summary"], revisionHash: revision.contentHash,
  status: "DRAFT", version: 1, expiresAt: "2035-01-01T00:00:00Z", sentAt: null,
  updatedAt: "2020-01-01T00:00:00Z", revision, requester: { id: "owner", name: "Persona de prueba", image: null },
  reviewerUser: null, organization: null, decisions: [],
};
export default function Fixture({ scenario }: { scenario?: string }) {
  const history = ["PENDING", "IN_REVIEW", "PARTIAL", "CHANGES_REQUESTED", "DECLINED", "CONFIRMED", "EXPIRED", "REVOKED"].map((status, index) => ({
    ...base, id: status.toLowerCase(), status, relationshipLabel: `Supervisor ${index}`, sentAt: "2026-10-14T23:25:00Z",
    decisions: ["PARTIAL", "CONFIRMED", "REVOKED"].includes(status) ? [{ id: "decision", responses: {}, summaryComment: "Decisión conservada", decidedAt: "2026-10-15T00:00:00Z", reviewer: { name: "Revisor" } }] : [],
  }));
  const requests = scenario === "empty" ? [] : scenario === "history" ? [base, ...history, { ...base, id: "cooldown", status: "PENDING", updatedAt: new Date().toISOString() }, { ...base, id: "expired-incoming", requesterId: "other", status: "EXPIRED", revision: { ...revision, thumbnailMediaId: "recipient-secret-media" } }, { ...base, id: "revoked-incoming", requesterId: "other", status: "REVOKED", revision: { ...revision, thumbnailMediaId: "recipient-secret-media" } }] : [base];
  return <main className="mx-auto max-w-[1440px] p-2 sm:p-6"><EndorsementConsole currentUserId="owner" initialRevisionId={scenario === "initial" ? "revision-two" : undefined} revisions={scenario === "empty" ? [] : [revision, { ...revision, id: "revision-two", revisionNo: 2, summary: "Segunda versión" }]} requests={requests} /></main>;
}
