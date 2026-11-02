import {
  PublicationReviewConsole,
  type PublicationReviewView,
} from "@/components/terraqo/publication-review-console";
const review: PublicationReviewView = {
  id: "review-fixture",
  collectionVersion: 3,
  scopeHash: "a".repeat(64),
  decision: "PENDING",
  comment: null,
  revokedAt: null,
  revokedReason: null,
  workspace: { name: "Empresa de demostración" },
  snapshot: {
    policy: "enterprise-publication-v1",
    destination: "PUBLIC_SELECTION",
    collectionId: "selection-fixture",
    collectionVersion: 3,
    workspaceId: "workspace-fixture",
    title: "Control geométrico del frente norte",
    description:
      "Selección de evidencia de campo para la trayectoria profesional.",
    items: [
      {
        revisionId: "revision-fixture",
        revisionNo: 2,
        contentHash: "hash-fixture",
        worklogId: "worklog-fixture",
        fields: {
          summary:
            "Verificación de ejes y niveles antes del siguiente vaciado.",
          contributionRole: "Responsable de control topográfico",
          methods: ["Estación total", "Nivelación geométrica"],
        },
        mediaIds: ["media-fixture"],
      },
    ],
  },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return (
    <main className="mx-auto max-w-5xl bg-slate-50 p-4 sm:p-10">
      <PublicationReviewConsole
        reviews={[review]}
        canReview={view !== "professional"}
      />
    </main>
  );
}
