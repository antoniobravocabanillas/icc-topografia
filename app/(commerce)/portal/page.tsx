import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import type { ElementType } from "react";
import { BadgeCheck, BriefcaseBusiness, FileText, FolderKanban, LifeBuoy, MapPin, UserRound } from "lucide-react";
import { auth } from "@/auth";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/forms/submit-button";
import { PortalFileUploader } from "@/components/portal/file-uploader";
import { ProfessionalDocumentUploader } from "@/components/portal/professional-document-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { createCustomerTicketAction, replyCustomerTicketAction, respondPublicQuoteFromFormAction, updateClientProfileAction } from "@/lib/server/customer-actions";
import { createMetadata } from "@/lib/seo";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { formatCurrency } from "@/lib/utils";

export const metadata = createMetadata({
  title: "Portal de cliente",
  description: "Cotizaciones, proyectos, documentos y tickets de soporte para clientes ICC.",
  path: "/portal"
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClientPortalPageProps = {
  searchParams: Promise<{ success?: string; status?: string }>;
};

const ticketCategories = [
  ["EQUIPMENT", "Equipo"],
  ["SERVICE", "Servicio"],
  ["CALIBRATION", "Calibracion"],
  ["REPAIR", "Reparacion"],
  ["WARRANTY", "Garantia"],
  ["TECHNICAL_QUERY", "Consulta tecnica"],
  ["OTHER", "Otro"]
];

const successMessages: Record<string, string> = {
  profile: "Datos actualizados correctamente.",
  ticket: "Ticket creado. El equipo ICC lo revisara y respondera desde soporte.",
  reply: "Respuesta enviada al ticket.",
  quote_accepted: "Cotizacion aceptada. El equipo comercial fue notificado.",
  quote_rejected: "Cotizacion rechazada. El equipo comercial fue notificado."
};

export default async function ClientPortalPage({ searchParams }: ClientPortalPageProps) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.email) redirect("/cuenta?callbackUrl=/portal");
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();

  const account = await prisma.clientAccount.findFirst({
    where: {
      OR: [{ userId: session.user.id }, { user: { email: session.user.email } }],
      terraqoWorkspaceId,
      deletedAt: null
    },
    include: {
      company: true,
      contact: true,
      client: {
        include: {
          quotes: { where: { terraqoWorkspaceId }, include: { items: true, sellerProfile: true }, orderBy: { createdAt: "desc" } },
          projects: { where: { terraqoWorkspaceId }, include: { images: { orderBy: { position: "asc" }, take: 1 }, progress: { orderBy: { createdAt: "desc" }, take: 3 } }, orderBy: { updatedAt: "desc" } },
          tickets: { where: { terraqoWorkspaceId }, include: { assignedProfile: true, messages: { orderBy: { createdAt: "asc" } } }, orderBy: { updatedAt: "desc" } },
          documents: { orderBy: { createdAt: "desc" } }
        }
      }
    }
  });
  const professionalProfile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      experiences: { include: { project: { select: { title: true, slug: true } } }, orderBy: { createdAt: "desc" }, take: 6 },
      affiliations: { orderBy: [{ current: "desc" }, { updatedAt: "desc" }], take: 6 },
      applications: {
        include: {
          workspace: { select: { name: true } },
          jobPost: { select: { title: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 6
      },
      documents: {
        orderBy: { uploadedAt: "desc" },
        select: { id: true, type: true, fileName: true, reviewStatus: true, reviewNote: true }
      }
    }
  });

  if (!account || !["active", "approved"].includes(account.status) || !account.client || account.client.terraqoWorkspaceId !== terraqoWorkspaceId) {
    if (professionalProfile) {
      return <ProfessionalPortal profile={professionalProfile} />;
    }

    return (
      <section className="bg-[#f6fbff] py-16">
        <div className="container max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle>Acceso pendiente de validacion</CardTitle>
              <CardDescription>
                Tu solicitud de portal cliente esta registrada, pero un administrador debe validar empresa, contacto y permisos antes de activar la cuenta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-4 text-sm">
                <p className="font-semibold">Estado actual: {account?.status || "sin solicitud vinculada"}</p>
                <p className="mt-1 text-muted-foreground">Si ya eres cliente ICC, solicita a tu asesor que apruebe tu acceso desde Clientes 360.</p>
              </div>
              <Button asChild>
                <Link href="/contacto">Contactar a ICC</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  const client = account.client;

  return (
    <section className="bg-[#f6fbff] py-12">
      <div className="container space-y-8">
        {params.success && successMessages[params.success] ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {successMessages[params.success]}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="rounded-lg border bg-[#03111D] p-7 text-white shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#24C8EE]">Portal ICC</p>
            <h1 className="mt-4 font-display text-4xl font-bold">Operacion del cliente</h1>
            <p className="mt-4 max-w-2xl text-white/72">
              Consulta tus cotizaciones, tickets de soporte, proyectos contratados y documentos comerciales en un solo lugar.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric icon={FileText} label="Cotizaciones" value={client.quotes.length} />
              <Metric icon={LifeBuoy} label="Tickets" value={client.tickets.length} />
              <Metric icon={FolderKanban} label="Proyectos" value={client.projects.length} />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Perfil comercial</CardTitle>
              <CardDescription>Datos usados para propuestas, tickets y seguimiento.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={updateClientProfileAction} className="grid gap-3">
                <Input name="name" defaultValue={client.name} placeholder="Nombre" />
                <Input name="company" defaultValue={client.company || ""} placeholder="Empresa" />
                <Input name="document" defaultValue={client.document || ""} placeholder="RUC / DNI" />
                <Input name="phone" defaultValue={client.phone || ""} placeholder="Telefono" />
                <Input name="address" defaultValue={client.address || ""} placeholder="Direccion" />
                <Input name="contactName" defaultValue={client.contactName || ""} placeholder="Contacto principal" />
                <SubmitButton pendingText="Actualizando...">Actualizar perfil</SubmitButton>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Cotizaciones recibidas</CardTitle>
              <CardDescription>Acepta, rechaza o descarga tus propuestas comerciales.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {client.quotes.map((quote) => (
                <div key={quote.id} className="rounded-lg border bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-display text-xl font-bold">{quote.number}</p>
                      <p className="text-sm text-muted-foreground">{quote.items.map((item) => item.description).join(", ")}</p>
                      <p className="mt-2 text-sm">Asesor: {quote.sellerProfile?.displayName || "Equipo ICC"}</p>
                    </div>
                    <div className="text-left md:text-right">
                      <StatusBadge status={quote.status} />
                      <p className="mt-2 font-display text-2xl font-bold">{formatCurrency(Number(quote.total), quote.currency)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {quote.publicToken ? <Button asChild variant="outline" size="sm"><Link href={`/cotizaciones/${quote.publicToken}`}>Ver detalle</Link></Button> : null}
                    <Button asChild variant="outline" size="sm"><Link href={`/api/quotes/${quote.id}/pdf`} target="_blank">Descargar PDF</Link></Button>
                    {quote.publicToken ? (
                      <>
                        <form action={respondPublicQuoteFromFormAction.bind(null, quote.publicToken)}>
                          <input type="hidden" name="status" value="ACCEPTED" />
                          <input type="hidden" name="redirectTo" value="/portal?success=quote_accepted" />
                          <SubmitButton size="sm" pendingText="Aceptando...">Aceptar</SubmitButton>
                        </form>
                        <form action={respondPublicQuoteFromFormAction.bind(null, quote.publicToken)}>
                          <input type="hidden" name="status" value="REJECTED" />
                          <input type="hidden" name="redirectTo" value="/portal?success=quote_rejected" />
                          <SubmitButton size="sm" variant="outline" pendingText="Enviando...">Rechazar</SubmitButton>
                        </form>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              {!client.quotes.length ? <p className="text-sm text-muted-foreground">Aun no tienes cotizaciones registradas.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nuevo ticket de soporte</CardTitle>
              <CardDescription>Solicita asistencia, calibracion, garantia o revision tecnica.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createCustomerTicketAction} className="grid gap-3">
                <Input name="subject" placeholder="Asunto" required />
                <select name="category" className="h-11 rounded-md border bg-background px-3 text-sm">
                  {ticketCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select name="priority" className="h-11 rounded-md border bg-background px-3 text-sm">
                  <option value="MEDIUM">Prioridad media</option>
                  <option value="LOW">Baja</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
                <Textarea name="description" placeholder="Describe el equipo, servicio, falla o alcance solicitado" required />
                <PortalFileUploader name="attachments" label="Adjuntos" description="Sube fotos del equipo, evidencia o PDF de referencia." />
                <SubmitButton pendingText="Creando ticket...">Crear ticket</SubmitButton>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tickets activos</CardTitle>
            <CardDescription>Historial de respuestas entre tu equipo y soporte ICC.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {client.tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-lg border bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-display text-lg font-bold">{ticket.code} - {ticket.subject}</p>
                    <p className="text-sm text-muted-foreground">Responsable: {ticket.assignedProfile?.displayName || "Pendiente de asignacion"}</p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
                <div className="mt-4 grid gap-2">
                  {ticket.messages.map((message) => (
                    <div key={message.id} className="rounded-md bg-muted/50 p-3 text-sm">
                      <p className="font-semibold">{message.sender === "staff" ? "ICC" : "Cliente"}</p>
                      <p className="mt-1 text-muted-foreground">{message.body}</p>
                    </div>
                  ))}
                </div>
                <form action={replyCustomerTicketAction.bind(null, ticket.id)} className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
                  <Input name="body" placeholder="Responder ticket" />
                  <SubmitButton variant="outline" pendingText="Enviando...">Enviar</SubmitButton>
                </form>
              </div>
            ))}
            {!client.tickets.length ? <p className="text-sm text-muted-foreground">Todavia no tienes tickets.</p> : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Proyectos contratados</CardTitle>
              <CardDescription>Avances, estado y evidencia tecnica asociada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {client.projects.map((project) => (
                <div key={project.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-display text-lg font-bold">{project.title}</p>
                      <p className="text-sm text-muted-foreground">{project.location || "Sin ubicacion"} | {project.servicesApplied.join(", ")}</p>
                    </div>
                    <StatusBadge status={project.status} />
                  </div>
                  {project.progress.length ? (
                    <div className="mt-3 space-y-2">
                      {project.progress.map((entry) => (
                        <p key={entry.id} className="rounded-md bg-muted/50 p-3 text-sm">{entry.title}: {entry.body}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {!client.projects.length ? <p className="text-sm text-muted-foreground">No hay proyectos vinculados todavia.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documentos</CardTitle>
              <CardDescription>Fichas, informes, contratos o entregables compartidos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {client.documents.map((document) => (
                <Link key={document.id} href={document.url} target="_blank" className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50">
                  <UserRound className="h-4 w-4 text-primary" />
                  <span className="font-medium">{document.title}</span>
                </Link>
              ))}
              {!client.documents.length ? <p className="text-sm text-muted-foreground">No hay documentos compartidos.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

type ProfessionalPortalProfile = Prisma.TerraqoProfessionalProfileGetPayload<{
  include: {
    experiences: { include: { project: { select: { title: true; slug: true } } } };
    affiliations: true;
    applications: {
      include: {
        workspace: { select: { name: true } };
        jobPost: { select: { title: true } };
      };
    };
    documents: {
      select: { id: true; type: true; fileName: true; reviewStatus: true; reviewNote: true };
    };
  };
}>;

function ProfessionalPortal({ profile }: { profile: ProfessionalPortalProfile }) {
  return (
    <section className="bg-[#f6fbff] py-12">
      <div className="container space-y-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="rounded-lg border bg-[#03111D] p-7 text-white shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#24C8EE]">Portal Terraqo</p>
            <h1 className="mt-4 font-display text-4xl font-bold">Perfil profesional y CV vivo</h1>
            <p className="mt-4 max-w-2xl text-white/72">
              Administra tu disponibilidad, experiencia tecnica y postulaciones. Tu CV vivo se alimentara de proyectos reales validados dentro de Terraqo.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric icon={BriefcaseBusiness} label="Experiencias" value={profile.experiences.length} />
              <Metric icon={FileText} label="Postulaciones" value={profile.applications.length} />
              <Metric icon={BadgeCheck} label="Validaciones" value={profile.experiences.filter((item) => item.verifiedByTerraqo).length} />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Estado profesional</CardTitle>
              <CardDescription>Informacion visible segun permisos y suscripcion.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">Disponibilidad</p>
                <p className="mt-1 font-display text-2xl font-bold">{profile.status.replaceAll("_", " ")}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                {profile.city || "Ciudad por completar"} | {profile.yearsExperience ?? 0} anios de experiencia
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Categorias y especialidades</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...profile.professionalCategories, ...profile.specialties].length ? [...profile.professionalCategories, ...profile.specialties].map((item) => (
                    <span key={item} className="rounded-md border bg-muted px-2.5 py-1 text-xs font-semibold">{item}</span>
                  )) : <span className="text-sm text-muted-foreground">Pendiente de completar</span>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <ProfessionalDocumentUploader
          identityStatus={profile.identityVerificationStatus}
          identityNote={profile.identityVerificationNote}
          documents={profile.documents}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Vinculos profesionales</CardTitle>
              <CardDescription>Empresas declaradas o verificadas dentro de tu trayectoria privada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.affiliations.map((affiliation) => (
                <div key={affiliation.id} className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-bold">{affiliation.companyName}</p>
                      <p className="text-sm text-muted-foreground">{affiliation.roleTitle || "Rol por completar"}</p>
                    </div>
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                      {affiliation.verificationStatus === "MATCHED" ? "Empresa vinculada" : "Pendiente de validar"}
                    </span>
                  </div>
                </div>
              ))}
              {!profile.affiliations.length ? <p className="text-sm text-muted-foreground">Aun no has declarado una empresa actual.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Experiencia para CV vivo</CardTitle>
              <CardDescription>Los proyectos validados por Terraqo daran mas peso a tu perfil profesional.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.experiences.map((experience) => (
                <div key={experience.id} className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-bold">{experience.title}</p>
                      <p className="text-sm text-muted-foreground">{experience.companyName || "Empresa por confirmar"} | {experience.role || "Rol tecnico"}</p>
                      {experience.project ? <p className="mt-2 text-xs font-semibold text-primary">Proyecto validado: {experience.project.title}</p> : null}
                    </div>
                    {experience.verifiedByTerraqo ? <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">Validado</span> : null}
                  </div>
                </div>
              ))}
              {!profile.experiences.length ? <p className="text-sm text-muted-foreground">Aun no hay experiencias registradas.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Postulaciones y oportunidades</CardTitle>
              <CardDescription>Seguimiento privado de convocatorias vinculadas a workspaces Terraqo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.applications.map((application) => (
                <div key={application.id} className="rounded-md border p-4">
                  <p className="font-display text-lg font-bold">{application.jobPost?.title || "Bolsa de talento general"}</p>
                  <p className="text-sm text-muted-foreground">{application.workspace.name}</p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">{application.status}</p>
                </div>
              ))}
              {!profile.applications.length ? <p className="text-sm text-muted-foreground">Aun no tienes postulaciones.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: ElementType; label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/12 bg-white/[0.06] p-4">
      <Icon className="h-5 w-5 text-[#24C8EE]" />
      <p className="mt-4 font-display text-3xl font-bold">{value}</p>
      <p className="text-sm text-white/60">{label}</p>
    </div>
  );
}
