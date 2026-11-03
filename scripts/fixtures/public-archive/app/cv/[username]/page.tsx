import { PublicCVPage } from "@/components/terraqo/public-cv";
import type { PublicCvProfile } from "@/lib/terraqo/public-cv";

// Isolated synthetic profile: this harness never queries a real account or database.
const profile = {
  id: "fixture-profile", username: "fixture", liveCvEnabled: true, liveCvVisibility: "PUBLIC",
  user: { name: "Perfil de prueba", image: null },
  headline: "Topografía y control de obra", bio: "Trabajo de campo documentado con evidencias públicas.",
  city: "Lima, Perú", status: "OPEN_TO_PROJECTS", identityVerificationStatus: "PENDING",
  updatedAt: new Date("2026-10-28T15:00:00Z"),
  specialties: ["Topografía"], professionalCategories: [], software: [], equipment: [],
  experiences: [], affiliations: [], education: [], documents: [], socialLinks: [],
  worklogs: [1, 2].map(index => ({
    id: `work-${index}`, title: index === 1 ? "Control de niveles en campo" : "Replanteo de ejes y avance de obra",
    summary: "Registro sintético para comprobar presentación y navegación.",
    occurredAt: new Date("2026-10-28T15:00:00Z"), evidenceStatus: "DECLARED",
    locationLabel: "Lima, Perú", skills: ["Topografía"], project: null, workspace: null,
    evidenceUrls: [], validations: [], media: [{ id: `fixture-${index}`, contentType: "image/svg+xml" }],
  })),
} as unknown as PublicCvProfile;

export default function Page() { return <PublicCVPage profile={profile} />; }
