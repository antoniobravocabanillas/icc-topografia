import { CvImportWorkbench } from "@/components/portal/cv-import-workbench";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { prisma } from "@/lib/prisma";
import { serializeCvImport } from "@/lib/server/cv-import";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CvImportPage() {
  const { profile } = await requireProfessionalPortal();
  const cv = profile.documents.find((document) => document.type === "CV") || null;
  const latestImport = await prisma.terraqoCvImport.findFirst({
    where: { professionalProfileId: profile.id, ...(cv ? { documentId: cv.id } : {}) },
    include: { items: { orderBy: [{ type: "asc" }, { position: "asc" }] } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-w-0 space-y-6 py-5 sm:space-y-8 sm:py-7 lg:py-9">
      <PortalPageHeading eyebrow="Importación asistida" title="Convierte tu CV en un perfil editable." description="Lee experiencias, estudios y capacidades en una sola operación. Tú decides qué conservar antes de crear cualquier registro." />
      <CvImportWorkbench
        cv={cv ? { id: cv.id, fileName: cv.fileName, uploadedAt: new Date(cv.uploadedAt).toISOString() } : null}
        initialImport={latestImport ? JSON.parse(JSON.stringify(serializeCvImport(latestImport))) : null}
        serviceAvailable={Boolean(process.env.TERRAQO_DOCUMENT_AI_URL && process.env.TERRAQO_DOCUMENT_AI_TOKEN)}
      />
    </div>
  );
}
