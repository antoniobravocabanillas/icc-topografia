import { PublicCVPage } from "@/components/terraqo/public-cv";
import type { PublicCvProfile } from "@/lib/terraqo/public-cv";

// Synthetic data for local visual tests. No environment files or database reads.
export default function Fixture({ scenario = "" }: { scenario?: string }) {
  const profile = {
    id: "fixture-profile", username: "fixture", liveCvEnabled: true, liveCvVisibility: "PUBLIC",
    user: { name: scenario === "long" ? "María del Carmen Fernández Cabanillas de la Cruz" : "Ana Bravo", image: scenario === "photo" ? "/avatar.webp" : scenario === "broken" ? "/missing-avatar.webp" : null },
    headline: "Topografía y control de obra", bio: "Control geométrico, replanteo y seguimiento de obra. Una trayectoria contada desde el trabajo de campo.",
    city: "Lima, Perú", status: scenario === "unavailable" ? "NOT_AVAILABLE" : "OPEN_TO_PROJECTS", identityVerificationStatus: "PENDING", messagePrivacy: scenario === "no-contact" ? "NOBODY" : "EVERYONE",
    updatedAt: new Date("2026-11-14T15:00:00Z"),
    specialties: [], professionalCategories: [], software: [], equipment: [],
    experiences: [], affiliations: [], education: [], socialLinks: [],
    documents: [{ id: "PRIVATE-DOCUMENT-CANARY", type: "DNI_FRONT", reviewStatus: "VERIFIED", uploadedAt: new Date(), reviewedAt: new Date() }],
    worklogs: scenario === "empty" ? [] : [1, 2].map(index => ({
      id: `work-${index}`, title: index === 1 ? "Control de niveles en campo" : "Replanteo de ejes y avance de obra",
      summary: "Registro de campo para comprobar cotas y documentar la contribución del equipo en la obra. Material sintético de prueba de interfaz.",
      occurredAt: new Date(`2026-11-${15 - index}T15:00:00Z`), evidenceStatus: index === 1 ? "DECLARED" : "CONFIRMED",
      locationLabel: "Lima, Perú", skills: ["Topografía"], project: { clientName: "PRIVATE-CLIENT-CANARY" }, workspace: null,
      evidenceUrls: [], validations: [], media: scenario === "no-image" ? [] : [{ id: `fixture-${index}`, contentType: "image/webp" }],
    })),
  } as unknown as PublicCvProfile;
  return <PublicCVPage profile={profile} availabilityUpdatedAt={scenario === "dated" || scenario === "unavailable" ? new Date("2026-11-10T15:00:00Z") : null} />;
}
