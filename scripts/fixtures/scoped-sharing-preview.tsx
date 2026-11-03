import { ScopedSharingConsole } from "@/components/terraqo/scoped-sharing-console";

export default function SharingPreviewFixture() {
  return <main className="mx-auto max-w-7xl p-4"><ScopedSharingConsole collections={[]} candidates={[{
    revisionId: "synthetic-revision", title: "Título reservado", summary: "Descripción autorizada",
    outcome: "Resultado de prueba", contributionRole: "Responsable de medición",
    responsibilities: ["Control de niveles"], methods: ["Nivelación"], tools: ["Estación total"],
    occurredAt: "2026-11-02T02:00:00Z", locationLabel: "Lima", mediaCount: 2,
  }]} /></main>;
}
