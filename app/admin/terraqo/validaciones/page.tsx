import Link from "next/link";
import { revalidatePath } from "next/cache";
import { BadgeCheck, BriefcaseBusiness, Building2, FileCheck2, ShieldCheck, UserRoundCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProfessionalDocumentPreview } from "@/components/terraqo/professional-document-preview";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

async function reviewProfessionalDocumentAction(formData: FormData) {
  "use server";

  const session = await requireAdminPage(["SUPER_ADMIN"]);
  const documentId = value(formData, "documentId");
  const decision = value(formData, "decision");
  const reviewNote = value(formData, "reviewNote");
  if (!documentId || !["VERIFIED", "REJECTED"].includes(decision)) return;

  const document = await prisma.terraqoProfessionalDocument.findUnique({
    where: { id: documentId },
    select: { id: true, professionalProfileId: true, type: true }
  });
  if (!document) return;

  const reviewedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.terraqoProfessionalDocument.update({
      where: { id: document.id },
      data: {
        reviewStatus: decision as "VERIFIED" | "REJECTED",
        reviewNote: reviewNote || null,
        reviewedAt,
        reviewedByUserId: session.user.id
      }
    });

    if (document.type === "DNI_FRONT" || document.type === "DNI_BACK") {
      const identityDocs = await tx.terraqoProfessionalDocument.findMany({
        where: {
          professionalProfileId: document.professionalProfileId,
          type: { in: ["DNI_FRONT", "DNI_BACK"] }
        },
        select: { type: true, reviewStatus: true }
      });
      const hasRejected = identityDocs.some((item) => item.reviewStatus === "REJECTED") || decision === "REJECTED";
      const hasFront = identityDocs.some((item) => item.type === "DNI_FRONT" && item.reviewStatus === "VERIFIED");
      const hasBack = identityDocs.some((item) => item.type === "DNI_BACK" && item.reviewStatus === "VERIFIED");
      await tx.terraqoProfessionalProfile.update({
        where: { id: document.professionalProfileId },
        data: {
          identityVerificationStatus: hasRejected ? "REJECTED" : hasFront && hasBack ? "VERIFIED" : "UNDER_REVIEW",
          identityVerifiedAt: hasFront && hasBack && !hasRejected ? reviewedAt : null,
          identityVerificationNote: reviewNote || null
        }
      });
    }
  });

  revalidatePath("/admin/terraqo");
  revalidatePath("/admin/terraqo/validaciones");
}

async function reviewProfessionalExperienceAction(formData: FormData) {
  "use server";

  await requireAdminPage(["SUPER_ADMIN"]);
  const experienceId = value(formData, "experienceId");
  const decision = value(formData, "decision");
  const verificationNote = value(formData, "verificationNote");
  if (!experienceId || !["APPROVED", "REJECTED"].includes(decision)) return;

  await prisma.terraqoProfessionalExperience.update({
    where: { id: experienceId },
    data: {
      verificationStatus: decision as "APPROVED" | "REJECTED",
      verifiedByTerraqo: decision === "APPROVED",
      verificationNote: verificationNote || null
    }
  });

  revalidatePath("/admin/terraqo");
  revalidatePath("/admin/terraqo/validaciones");
}

export default async function TerraqoValidationsPage() {
  await requireAdminPage(["SUPER_ADMIN"]);

  const [documents, identityProfiles, experiences, totals] = await Promise.all([
    prisma.terraqoProfessionalDocument.findMany({
      where: { reviewStatus: "SUBMITTED" },
      include: {
        workspace: { select: { id: true, name: true, brandName: true } },
        professionalProfile: { select: { id: true, username: true, headline: true, user: { select: { name: true, email: true } } } }
      },
      orderBy: { uploadedAt: "asc" },
      take: 80
    }),
    prisma.terraqoProfessionalProfile.findMany({
      where: { identityVerificationStatus: "UNDER_REVIEW" },
      include: {
        user: { select: { name: true, email: true } },
        documents: {
          where: { type: { in: ["DNI_FRONT", "DNI_BACK"] } },
          orderBy: { uploadedAt: "desc" },
          take: 4
        }
      },
      orderBy: { updatedAt: "asc" },
      take: 50
    }),
    prisma.terraqoProfessionalExperience.findMany({
      where: { verificationStatus: "REQUESTED" },
      include: {
        professionalProfile: { select: { id: true, username: true, user: { select: { name: true, email: true } } } },
        project: { select: { title: true, terraqoWorkspace: { select: { name: true, brandName: true } } } }
      },
      orderBy: [{ verificationRequestedAt: "asc" }, { createdAt: "asc" }],
      take: 80
    }),
    prisma.$transaction([
      prisma.terraqoWorkspace.count({ where: { deletedAt: null } }),
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.terraqoProfessionalProfile.count(),
      prisma.user.count()
    ])
  ]);

  const pendingIdentity = identityProfiles.length;
  const pendingDocs = documents.length;
  const pendingExperiences = experiences.length;

  return (
    <section className="space-y-8">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">Gobierno Terraqo</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-[#071b28]">Validaciones, cuentas y control global</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Mesa operativa para revisar documentación, identidad, experiencias y localizar cuentas de empresas o profesionales sin depender del workspace seleccionado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button asChild variant="outline"><Link href="/admin/terraqo">Workspaces</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/terraqo/usuarios">Usuarios y accesos</Link></Button>
          <Button asChild><Link href="/admin/terraqo/red">Red por workspace</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric icon={FileCheck2} value={pendingDocs} label="Documentos por revisar" tone="amber" />
        <Metric icon={ShieldCheck} value={pendingIdentity} label="Identidades en revisión" tone="amber" />
        <Metric icon={BriefcaseBusiness} value={pendingExperiences} label="Experiencias solicitadas" tone="amber" />
        <Metric icon={Building2} value={totals[0]} label="Workspaces" />
        <Metric icon={Building2} value={totals[1]} label="Empresas" />
        <Metric icon={UserRoundCheck} value={totals[2]} label="Profesionales" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documentación pendiente</CardTitle>
          <CardDescription>Revisión global de archivos subidos por profesionales. Aprobar DNI actualiza la identidad cuando ambas caras estén verificadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.map((document) => (
            <article key={document.id} className="grid gap-4 rounded-lg border bg-white p-4 xl:grid-cols-[1fr_220px_360px] xl:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{document.type}</Badge>
                  <Badge>{document.workspace.brandName || document.workspace.name}</Badge>
                </div>
                <h2 className="mt-2 font-semibold">{document.professionalProfile.user.name || document.professionalProfile.user.email}</h2>
                <p className="text-sm text-muted-foreground">{document.professionalProfile.headline || "Perfil profesional"} · {document.fileName}</p>
                <p className="mt-1 text-xs text-muted-foreground">Subido: {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(document.uploadedAt)}</p>
              </div>
              <ProfessionalDocumentPreview href={`/api/terraqo/professional-documents/${document.id}`} title="Ver documento" fileName={document.fileName} contentType={document.contentType} />
              <ReviewDocumentForm documentId={document.id} />
            </article>
          ))}
          {!documents.length ? <EmptyState text="No hay documentos pendientes de revisión." /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identidad profesional en revisión</CardTitle>
          <CardDescription>Bandeja rápida para perfiles que esperan validación de identidad. Usa la sección de documentos para aprobar o rechazar cada archivo.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {identityProfiles.map((profile) => (
            <article key={profile.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{profile.user.name || profile.user.email}</h2>
                  <p className="text-sm text-muted-foreground">{profile.user.email}</p>
                </div>
                {profile.username ? <Button asChild size="sm" variant="outline"><Link href={`/cv/${profile.username}`} target="_blank">CV</Link></Button> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.documents.map((document) => (
                  <ProfessionalDocumentPreview key={document.id} href={`/api/terraqo/professional-documents/${document.id}`} title={document.type} fileName={document.fileName} contentType={document.contentType} />
                ))}
              </div>
            </article>
          ))}
          {!identityProfiles.length ? <EmptyState text="No hay perfiles con identidad en revisión." /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Experiencias solicitadas para verificación Terraqo</CardTitle>
          <CardDescription>Validación referencial interna. Aprobar marca la experiencia como verificada por Terraqo; rechazar conserva la nota para auditoría.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {experiences.map((experience) => (
            <article key={experience.id} className="grid gap-4 rounded-lg border bg-white p-4 xl:grid-cols-[1fr_380px] xl:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">REQUESTED</Badge>
                  {experience.project?.terraqoWorkspace ? <Badge>{experience.project.terraqoWorkspace.brandName || experience.project.terraqoWorkspace.name}</Badge> : null}
                </div>
                <h2 className="mt-2 font-semibold">{experience.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {experience.professionalProfile.user.name || experience.professionalProfile.user.email} · {experience.role || "Rol por revisar"} · {experience.companyName || experience.project?.title || "Empresa/proyecto no indicado"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{experience.evidence.length ? experience.evidence.join(" · ") : "Sin evidencias declaradas adicionales."}</p>
                {experience.validatorEmail || experience.validatorName ? <p className="mt-2 text-xs text-muted-foreground">Responsable sugerido: {experience.validatorName || experience.validatorEmail}</p> : null}
              </div>
              <ReviewExperienceForm experienceId={experience.id} />
            </article>
          ))}
          {!experiences.length ? <EmptyState text="No hay experiencias solicitadas para verificación." /> : null}
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ icon: Icon, value, label, tone = "neutral" }: { icon: typeof FileCheck2; value: number; label: string; tone?: "neutral" | "amber" }) {
  return (
    <Card className={tone === "amber" ? "border-amber-200 bg-amber-50/50" : undefined}>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={tone === "amber" ? "grid h-11 w-11 place-items-center rounded-lg bg-amber-100 text-amber-700" : "grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"}><Icon className="h-5 w-5" /></span>
        <div>
          <p className="font-display text-2xl font-bold">{value}</p>
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewDocumentForm({ documentId }: { documentId: string }) {
  return (
    <form action={reviewProfessionalDocumentAction} className="grid gap-2">
      <Input name="reviewNote" placeholder="Nota interna u observación para el profesional" />
      <input type="hidden" name="documentId" value={documentId} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" name="decision" value="VERIFIED"><BadgeCheck className="mr-2 h-4 w-4" />Aprobar</Button>
        <Button type="submit" name="decision" value="REJECTED" variant="outline"><XCircle className="mr-2 h-4 w-4" />Rechazar</Button>
      </div>
    </form>
  );
}

function ReviewExperienceForm({ experienceId }: { experienceId: string }) {
  return (
    <form action={reviewProfessionalExperienceAction} className="grid gap-2">
      <Textarea name="verificationNote" placeholder="Criterio de validación, llamada realizada, evidencia revisada o motivo de rechazo." className="min-h-24" />
      <input type="hidden" name="experienceId" value={experienceId} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" name="decision" value="APPROVED"><BadgeCheck className="mr-2 h-4 w-4" />Validar</Button>
        <Button type="submit" name="decision" value="REJECTED" variant="outline"><XCircle className="mr-2 h-4 w-4" />Rechazar</Button>
      </div>
    </form>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">{text}</div>;
}
