import { ProfessionalDocumentUploader } from "@/components/portal/professional-document-uploader";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DocumentsPage() {
  const { profile } = await requireProfessionalPortal();
  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
      <PortalPageHeading
        eyebrow="Documentos y datos"
        title="Tu carpeta profesional privada."
        description="Carga CV, identidad, certificados, antecedentes, examenes medicos y documentos operativos. Puedes previsualizar y descargar tus archivos desde el portal."
      />
      <ProfessionalDocumentUploader documents={profile.documents} identityStatus={profile.identityVerificationStatus} identityNote={profile.identityVerificationNote} />
    </div>
  );
}
