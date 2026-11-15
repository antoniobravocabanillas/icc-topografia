import { PublicCVSectionPage } from "@/components/terraqo/public-cv";
import type { PublicCvProfile } from "@/lib/terraqo/public-cv";

// Deliberately sensitive synthetic input. Browser tests inspect the server HTML
// and RSC payload, not merely the visible text, to verify DTO minimization.
const profile = {
  id: "fixture-profile", username: "fixture", user: { name: "Autor de prueba", image: null },
  experiences: [{ id: "SECRET_UNRELATED_EXPERIENCE", roleTitle: "SECRET_UNRELATED_ROLE", companyName: "SECRET_UNRELATED_COMPANY", description: "SECRET_UNRELATED_DESCRIPTION", visibility: "PUBLIC", verificationStatus: "APPROVED", verifiedByTerraqo: false, verificationNote: "SECRET_UNRELATED_NOTE", verifiedAt: null, updatedAt: new Date("2026-10-28T16:00:00Z"), workspace: null, project: null }], education: [], documents: [], affiliations: [],
  worklogs: [{
    id: "mapping", title: "Control de niveles autorizado", summary: "Contribución declarada de prueba.",
    outcome: "Resultado declarado de prueba.", type: "FIELD_UPDATE", evidenceStatus: "CONFIRMED",
    occurredAt: new Date("2026-10-27T15:00:00Z"), createdAt: new Date("2026-10-28T16:00:00Z"),
    locationLabel: "SECRET_COORDINATES_-12.0464_-77.0428", skills: ["Nivelación"],
    evidenceUrls: ["https://private.invalid/SECRET_RAW_EVIDENCE"], project: null, workspace: null,
    media: [
      { id: "fixture-1", fileName: "SECRET_ORIGINAL_FILENAME.webp", contentType: "image/webp" },
      { id: "fixture-2", fileName: "SECRET_SECOND_FILENAME.webp", contentType: "image/webp" },
      { id: "SECRET_UNSANITIZED_IMAGE", fileName: "SECRET_UNSANITIZED_IMAGE.svg", contentType: "image/svg+xml" },
      { id: "SECRET_INTERNAL_FILE", fileName: "SECRET_INTERNAL_PLAN.pdf", contentType: "application/pdf" },
    ],
    validations: [{ id: "legacy", responseNote: "SECRET_VALIDATOR_NOTE", validator: { name: "Validador público", image: "https://private.invalid/SECRET_AVATAR" }, createdAt: new Date("2026-10-28T16:00:00Z"), resolvedAt: new Date("2026-10-29T16:00:00Z") }],
  }],
} as unknown as PublicCvProfile;

profile.worklogs.push({ ...profile.worklogs[0], id: "SECRET_UNRELATED_WORKLOG", title: "SECRET_UNRELATED_TITLE" });
Object.assign(profile.experiences[0], { title: "SECRET_UNRELATED_TITLE", createdAt: new Date("2026-10-28T16:00:00Z"), evidence: [], highlights: [] });

export default function Page() {
  // Invoke the server mapper directly so Next dev's server-component debugging
  // does not serialize the deliberately poisoned fixture input as debug props.
  return PublicCVSectionPage({ profile, section: "evidencias", initialRecordId: "mapping" });
}
