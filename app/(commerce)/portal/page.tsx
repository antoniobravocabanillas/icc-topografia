import Link from "next/link";
import { redirect } from "next/navigation";
import type { ElementType } from "react";
import { FileText, FolderKanban, LifeBuoy, ShoppingCart, UserRound } from "lucide-react";
import { auth } from "@/auth";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/forms/submit-button";
import { PortalFileUploader } from "@/components/portal/file-uploader";
import { ProfessionalDashboard } from "@/components/terraqo/professional-dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { createCustomerTicketAction, replyCustomerTicketAction, respondPublicQuoteFromFormAction, updateClientProfileAction } from "@/lib/server/customer-actions";
import { createMetadata } from "@/lib/seo";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { worklogInclude } from "@/lib/terraqo/worklog";
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
  username: "Enlace publico del CV actualizado correctamente.",
  ticket: "Ticket creado. El equipo ICC lo revisara y respondera desde soporte.",
  reply: "Respuesta enviada al ticket.",
  quote_accepted: "Cotizacion aceptada. El equipo comercial fue notificado.",
  quote_rejected: "Cotizacion rechazada. El equipo comercial fue notificado.",
  availability: "Disponibilidad actualizada en tu perfil y CV vivo."
};

const statusMessages: Record<string, string> = {
  "username-invalid": "El usuario debe tener 3 a 30 caracteres: letras minusculas, numeros, punto, guion o guion bajo.",
  "username-taken": "Ese usuario ya esta en uso. Elige otra variante.",
  "profile-required": "Completa tu perfil profesional antes de crear un enlace publico.",
  "availability-invalid": "Selecciona un estado de disponibilidad válido."
};

export default async function ClientPortalPage({ searchParams }: ClientPortalPageProps) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.email) redirect("/cuenta");
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
          documents: { orderBy: { createdAt: "desc" } },
          user: {
            select: {
              orders: {
                where: { terraqoWorkspaceId },
                include: { items: { include: { product: { select: { name: true, slug: true } } } } },
                orderBy: { createdAt: "desc" },
                take: 30
              }
            }
          }
        }
      }
    }
  });
  const professionalProfile = await prisma.terraqoProfessionalProfile.findFirst({
    where: {
      OR: [
        { userId: session.user.id },
        { user: { email: session.user.email } }
      ],
    },
    include: {
      user: { select: { name: true, email: true, image: true } },
      experiences: { include: { project: { select: { title: true, slug: true, location: true, images: { select: { url: true }, orderBy: { position: "asc" }, take: 1 } } } }, orderBy: { createdAt: "desc" }, take: 6 },
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
        select: { id: true, type: true, fileName: true, contentType: true, size: true, reviewStatus: true, reviewNote: true, uploadedAt: true }
      },
      worklogs: {
        where: { deletedAt: null },
        include: worklogInclude,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 4
      }
    }
  });
  const professionalWorkspace = professionalProfile ? await prisma.terraqoWorkspaceMember.findFirst({
    where: { userId: professionalProfile.userId, active: true, role: "PROFESSIONAL", workspace: { active: true, deletedAt: null } },
    select: { workspaceId: true },
    orderBy: { joinedAt: "desc" }
  }) : null;

  const activeClientAccount = account && ["active", "approved"].includes(account.status) && account.client?.terraqoWorkspaceId === terraqoWorkspaceId ? account : null;
  const client = activeClientAccount?.client || null;
  const orders = client?.user?.orders || [];
  const publicOrderCode = (notes?: string | null) => notes?.match(/Codigo publico: ([A-Z0-9-]+)/)?.[1] || null;

  if (professionalProfile) {
    return (
      <div className="min-w-0 space-y-8">
        {params.success && successMessages[params.success] ? (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {successMessages[params.success]}
          </div>
        ) : null}
        {params.status && statusMessages[params.status] ? (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            {statusMessages[params.status]}
          </div>
        ) : null}
        <ProfessionalDashboard profile={professionalProfile} workspaceId={professionalWorkspace?.workspaceId} />
        {client ? (
          <section id="operaciones-comerciales" className="scroll-mt-28 space-y-6">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Operaciones comerciales</p>
              <h2 className="mt-1 font-display text-2xl font-bold">Compras, cotizaciones y soporte vinculados a tu cuenta</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Esta informacion se agrega a tu portal personal Terraqo sin reemplazar tu perfil profesional ni tus permisos existentes.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Pedidos de tienda tecnica</CardTitle>
                <CardDescription>Historial generado desde tiendas conectadas al workspace.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {orders.map((order) => (
                  <div key={order.id} className="rounded-lg border bg-white p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-display text-lg font-bold">{publicOrderCode(order.notes) || order.id}</p>
                        <p className="text-sm text-muted-foreground">
                          {order.items.map((item) => `${item.quantity} x ${item.product.name}`).join(", ")}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">{order.createdAt.toLocaleDateString("es-PE")}</p>
                      </div>
                      <div className="text-left md:text-right">
                        <StatusBadge status={order.status} />
                        <p className="mt-2 font-display text-xl font-bold">{formatCurrency(Number(order.total), order.currency)}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {!orders.length ? <p className="text-sm text-muted-foreground">Aun no tienes pedidos registrados.</p> : null}
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card id="cotizaciones" className="scroll-mt-28">
                <CardHeader>
                  <CardTitle>Cotizaciones recibidas</CardTitle>
                  <CardDescription>Acepta, rechaza o descarga propuestas comerciales.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {client.quotes.map((quote) => (
                    <div key={quote.id} className="rounded-lg border bg-white p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-display text-xl font-bold">{quote.number}</p>
                          <p className="text-sm text-muted-foreground">{quote.items.map((item) => item.description).join(", ")}</p>
                          <p className="mt-2 text-sm">Asesor: {quote.sellerProfile?.displayName || "Equipo comercial"}</p>
                        </div>
                        <div className="text-left md:text-right">
                          <StatusBadge status={quote.status} />
                          <p className="mt-2 font-display text-2xl font-bold">{formatCurrency(Number(quote.total), quote.currency)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!client.quotes.length ? <p className="text-sm text-muted-foreground">Aun no tienes cotizaciones registradas.</p> : null}
                </CardContent>
              </Card>

              <Card id="soporte" className="scroll-mt-28">
                <CardHeader>
                  <CardTitle>Soporte comercial y tecnico</CardTitle>
                  <CardDescription>Tickets asociados a tus operaciones con este workspace.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {client.tickets.slice(0, 3).map((ticket) => (
                    <div key={ticket.id} className="rounded-lg border bg-white p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-display text-lg font-bold">{ticket.code}</p>
                          <p className="text-sm text-muted-foreground">{ticket.subject}</p>
                        </div>
                        <StatusBadge status={ticket.status} />
                      </div>
                    </div>
                  ))}
                  {!client.tickets.length ? <p className="text-sm text-muted-foreground">Todavia no tienes tickets.</p> : null}
                </CardContent>
              </Card>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  if (!activeClientAccount || !client) {

    return (
      <div className="max-w-3xl py-8 lg:py-12">
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
    );
  }

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
        {params.success && successMessages[params.success] ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {successMessages[params.success]}
          </div>
        ) : null}
        {params.status && statusMessages[params.status] ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            {statusMessages[params.status]}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="rounded-lg border bg-[#03111D] p-7 text-white shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#24C8EE]">Portal ICC</p>
            <h1 className="mt-4 font-display text-4xl font-bold">Operacion del cliente</h1>
            <p className="mt-4 max-w-2xl text-white/72">
              Consulta tus cotizaciones, tickets de soporte, proyectos contratados y documentos comerciales en un solo lugar.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={ShoppingCart} label="Pedidos" value={orders.length} />
              <Metric icon={FileText} label="Cotizaciones" value={client.quotes.length} />
              <Metric icon={LifeBuoy} label="Tickets" value={client.tickets.length} />
              <Metric icon={FolderKanban} label="Proyectos" value={client.projects.length} />
            </div>
          </div>

          <Card id="cotizaciones" className="scroll-mt-28">
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

        <Card>
          <CardHeader>
            <CardTitle>Pedidos de tienda tecnica</CardTitle>
            <CardDescription>Historial generado desde la tienda conectada al workspace.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {orders.map((order) => (
              <div key={order.id} className="rounded-lg border bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-display text-lg font-bold">{publicOrderCode(order.notes) || order.id}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.items.map((item) => `${item.quantity} x ${item.product.name}`).join(", ")}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{order.createdAt.toLocaleDateString("es-PE")}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <StatusBadge status={order.status} />
                    <p className="mt-2 font-display text-xl font-bold">{formatCurrency(Number(order.total), order.currency)}</p>
                  </div>
                </div>
              </div>
            ))}
            {!orders.length ? <p className="text-sm text-muted-foreground">Aun no tienes pedidos registrados.</p> : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card id="soporte" className="scroll-mt-28">
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

          <Card id="proyectos" className="scroll-mt-28">
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
          <Card id="documentos" className="scroll-mt-28">
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
