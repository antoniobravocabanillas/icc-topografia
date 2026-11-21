import { ProfessionalDocumentUploader } from "@/components/portal/professional-document-uploader";

export default function Fixture() {
  return <main className="mx-auto max-w-6xl p-4 sm:p-8">
    <h1 className="mb-6 text-3xl font-bold">Documentos · Datos de prueba</h1>
    <ProfessionalDocumentUploader lifecycleEnabled identityStatus="VERIFIED" identityNote={null} documents={[
      { id: "cv-current", type: "CV", fileName: "CV profesional actualizado.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 2048, reviewStatus: "SUBMITTED", reviewNote: null, uploadedAt: "2026-11-20", lifecycleVersion: 1, replacesDocumentId: "cv-previous" },
      { id: "cv-previous", type: "CV", fileName: "CV anterior.pdf", contentType: "application/pdf", size: 1024, reviewStatus: "VERIFIED", reviewNote: null, uploadedAt: "2026-11-19", lifecycleVersion: 2 },
      { id: "cv-retired", type: "CV", fileName: "CV retirado.pdf", contentType: "application/pdf", size: 1024, reviewStatus: "SUBMITTED", reviewNote: null, uploadedAt: "2026-11-18", withdrawnAt: "2026-11-19", lifecycleVersion: 2 },
      { id: "active", type: "CERTIFICATE", fileName: "Certificado de formación en trabajo de campo.pdf", contentType: "application/pdf", size: 1024, reviewStatus: "VERIFIED", reviewNote: null, uploadedAt: "2026-11-20", lifecycleVersion: 1 },
      { id: "withdrawn", type: "MEDICAL_EXAM", fileName: "Constancia anterior.pdf", contentType: "application/pdf", size: 1024, reviewStatus: "SUBMITTED", reviewNote: null, uploadedAt: "2026-11-19", withdrawnAt: "2026-11-20", lifecycleVersion: 2 },
    ]} />
  </main>;
}
