import { EndorsementConsole } from "@/components/terraqo/endorsement-console";
const revision = { id: "revision-one", revisionNo: 1, contentHash: "synthetic-hash", title: "Título reservado", summary: "Descripción solicitada", tools: ["Estación total"] };
export default function Fixture() {
  return <main className="mx-auto max-w-7xl p-4"><EndorsementConsole currentUserId="owner" revisions={[revision]} requests={[{
    id: "draft-one", requesterId: "owner", reviewerUserId: null, reviewerEmail: "reviewer@example.com", relationshipLabel: "Supervisor", requestedScope: ["summary"], revisionHash: revision.contentHash, status: "DRAFT", version: 1, expiresAt: "2035-01-01T00:00:00Z", sentAt: null, revision,
    requester: { id: "owner", name: "Persona de prueba", image: null }, reviewerUser: null, organization: null, decisions: [],
  }]} /></main>;
}
