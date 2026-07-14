import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, Building2, FileText, FolderKanban, LifeBuoy, Users } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { formatCurrency } from "@/lib/utils";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"]);
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  const { id } = await params;
  const client = await prisma.client.findFirst({
    where: { id, terraqoWorkspaceId },
    include: {
      companyRef: {
        include: {
          contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }] },
          opportunities: { where: { deletedAt: null }, include: { sellerProfile: true, quotes: true, sales: true }, orderBy: { updatedAt: "desc" } },
          documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
          activities: { orderBy: { createdAt: "desc" }, take: 30 }
        }
      },
      leads: { where: { deletedAt: null }, include: { assignedProfile: true, opportunity: true }, orderBy: { createdAt: "desc" } },
      quotes: { where: { deletedAt: null }, include: { items: true, sellerProfile: true, sale: true }, orderBy: { createdAt: "desc" } },
      sales: { where: { deletedAt: null }, include: { sellerProfile: true, projects: true }, orderBy: { createdAt: "desc" } },
      projects: { where: { deletedAt: null }, include: { milestones: true, tasks: true }, orderBy: { updatedAt: "desc" } },
      tickets: { where: { deletedAt: null }, include: { assignedProfile: true }, orderBy: { updatedAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!client) notFound();
  const company = client.companyRef;

  return (
    <section className="space-y-8">
      <div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/clientes"><ArrowLeft className="h-4 w-4" /> Clientes</Link>
        </Button>
        <div className="mt-5 rounded-lg border bg-[#03111D] p-7 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#24C8EE]">Ficha 360</p>
          <h1 className="mt-3 font-display text-4xl font-bold">{company?.tradeName || company?.legalName || client.company || client.name}</h1>
          <p className="mt-3 max-w-3xl text-white/70">
            {company?.document ? `RUC/DNI: ${company.document} | ` : ""}{company?.address || client.address || "Direccion pendiente"}.
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        <Metric icon={Users} label="Contactos" value={company?.contacts.length || 1} />
        <Metric icon={FileText} label="Cotizaciones" value={client.quotes.length} />
        <Metric icon={FolderKanban} label="Proyectos" value={client.projects.length} />
        <Metric icon={LifeBuoy} label="Tickets abiertos" value={client.tickets.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)).length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contactos</CardTitle>
              <CardDescription>Relación empresa ↔ contactos para evitar duplicidad por email.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {(company?.contacts.length ? company.contacts : [{ id: client.id, name: client.name, email: client.email, phone: client.phone, roleTitle: client.contactName }]).map((contact) => (
                <div key={contact.id} className="rounded-md border bg-background p-4">
                  <p className="font-semibold">{contact.name}</p>
                  <p className="text-sm text-muted-foreground">{contact.roleTitle || "Contacto comercial"}</p>
                  <p className="mt-2 text-sm">{contact.email || client.email}</p>
                  <p className="text-sm text-muted-foreground">{contact.phone || client.phone || "-"}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial comercial</CardTitle>
              <CardDescription>Lead → oportunidad → cotizacion → venta.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {client.leads.map((lead) => (
                <div key={lead.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold">{lead.interest || lead.message}</p>
                    <StatusBadge status={lead.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">Vendedor: {lead.assignedProfile?.displayName || "Sin asignar"} | Oportunidad: {lead.opportunity?.code || "Pendiente"}</p>
                </div>
              ))}
              {company?.opportunities.map((opportunity) => (
                <div key={opportunity.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold">{opportunity.code} - {opportunity.title}</p>
                    <StatusBadge status={opportunity.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{formatCurrency(Number(opportunity.estimatedValue || 0))} | {opportunity.quotes.length} cot. | {opportunity.sales.length} venta(s)</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cotizaciones y ventas</CardTitle>
              <CardDescription>Snapshots comerciales preservados para trazabilidad.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {client.quotes.map((quote) => (
                <div key={quote.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold">{quote.number} - {quote.items.map((item) => item.description).join(", ")}</p>
                    <StatusBadge status={quote.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{formatCurrency(Number(quote.total), quote.currency)} | Venta: {quote.sale?.number || "Pendiente"}</p>
                </div>
              ))}
              {client.sales.map((sale) => (
                <div key={sale.id} className="rounded-md border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold">{sale.number}</p>
                    <StatusBadge status={sale.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{formatCurrency(Number(sale.amount), sale.currency)} | Proyecto: {sale.projects[0]?.title || "Sugerido"}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Proyectos y soporte</CardTitle>
              <CardDescription>Ejecucion, postventa y tickets asociados.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              {client.projects.map((project) => (
                <div key={project.id} className="rounded-md border p-4">
                  <p className="font-semibold">{project.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{project.milestones.length} hito(s) | {project.tasks.length} tarea(s)</p>
                  <StatusBadge status={project.status} />
                </div>
              ))}
              {client.tickets.map((ticket) => (
                <div key={ticket.id} className="rounded-md border p-4">
                  <p className="font-semibold">{ticket.code} - {ticket.subject}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Responsable: {ticket.assignedProfile?.displayName || "Sin asignar"}</p>
                  <StatusBadge status={ticket.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos empresa</CardTitle>
              <CardDescription>Base normalizada B2B.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Info label="Razon social" value={company?.legalName || client.company || "-"} />
              <Info label="Nombre comercial" value={company?.tradeName || "-"} />
              <Info label="Documento" value={company?.document || client.document || "-"} />
              <Info label="Telefono" value={company?.phone || client.phone || "-"} />
              <Info label="Email" value={company?.email || client.email} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documentos</CardTitle>
              <CardDescription>Contratos, planos, informes y entregables.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {client.documents.map((document) => (
                <Link key={document.id} href={document.url} target="_blank" className="block rounded-md border p-3 text-sm font-medium hover:bg-muted/50">{document.title}</Link>
              ))}
              {company?.documents.map((document) => (
                <Link key={document.id} href={document.url} target="_blank" className="block rounded-md border p-3 text-sm font-medium hover:bg-muted/50">{document.title}</Link>
              ))}
              {!client.documents.length && !company?.documents.length ? <p className="text-sm text-muted-foreground">Sin documentos cargados.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> Timeline</CardTitle>
              <CardDescription>Actividad comercial y operativa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {company?.activities.map((activity) => (
                <div key={activity.id} className="border-l-2 border-primary/30 pl-3">
                  <p className="text-sm font-semibold">{activity.title}</p>
                  <p className="text-xs text-muted-foreground">{activity.createdAt.toLocaleString("es-PE")}</p>
                </div>
              ))}
              {!company?.activities.length ? <p className="text-sm text-muted-foreground">Sin actividad registrada.</p> : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader>
        <Icon className="h-5 w-5 text-primary" />
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
