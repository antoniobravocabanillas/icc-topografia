import { EndorsementConsole, type EndorsementRequestItem } from "@/components/terraqo/endorsement-console";
const request: EndorsementRequestItem = {
  id: "review-one", requesterId: "author", reviewerUserId: "reviewer", reviewerEmail: "reviewer@example.com",
  relationshipLabel: "Supervisor directo", requestedScope: ["contributionRole", "outcome"], revisionHash: "fixed-revision-hash-001",
  status: "PENDING", version: 3, expiresAt: "2035-01-01T00:00:00Z", sentAt: "2026-10-14T23:25:00Z",
  revision: { id: "revision-one", revisionNo: 1, contentHash: "fixed-revision-hash-001", title: "NO MOSTRAR TÍTULO FUERA DE ALCANCE", contributionRole: "Responsable del control topográfico de puntos para contrapiso, piso 18.", outcome: "Puntos de nivel entregados al equipo de obra para el control de ejecución.", worklog: { id: "worklog-one" }, thumbnailMediaId: "never-fetch-owner-media" },
  requester: { id: "author", name: "Antonio (fixture local)", image: null }, reviewerUser: null, organization: null, decisions: [],
};
export default function Fixture({ scenario, selectedRequestId }: { scenario?: string; selectedRequestId?: string }) {
  const item = { ...request, revision: { ...request.revision, worklog: { ...request.revision.worklog!, newerRevisionAvailable: scenario === "newer" || scenario === "historical", historicalContextUnavailable: scenario === "historical" || scenario === "historical-unscoped", occurredAt: scenario === "historical" ? "NO MOSTRAR FECHA ACTUAL" : undefined } } };
  if (scenario === "historical") item.requestedScope = ["contributionRole", "occurredAt"];
  if (["expired", "revoked", "confirmed"].includes(scenario || "")) item.status = scenario === "expired" ? "EXPIRED" : scenario === "revoked" ? "REVOKED" : "CONFIRMED";
  return <main className="mx-auto max-w-[1440px] p-2 sm:p-6"><EndorsementConsole currentUserId="reviewer" revisions={[]} requests={scenario === "missing" ? [] : [item, { ...item, id: "review-two", requester: { ...item.requester, name: "Otra persona (fixture)" } }]} selectedRequestId={selectedRequestId} /></main>;
}
