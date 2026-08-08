import Link from "next/link";
import { redirect } from "next/navigation";
import type { ElementType } from "react";
import { FileText, FolderKanban, LifeBuoy, ShoppingCart } from "lucide-react";

import { auth } from "@/auth";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { respondPublicQuoteFromFormAction } from "@/lib/server/customer-actions";
import { createMetadata } from "@/lib/seo";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { formatCurrency } from "@/lib/utils";

export const metadata = createMetadata({
  title: "Operaciones comerciales",
  description: "Pedidos, cotizaciones, tickets y documentos vinculados a tus empresas y workspaces.",
  path: "/portal/operaciones"
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

function publicOrderCode(notes?: string | null) {
  return notes?.match(/Codigo publico: ([A-Z0-9-]+)/)?.[1] || null;
}

export default async function CommercialOperationsPage() {
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
                take: 50
              }
            }
          }
        }
      }
    }
  });

  const client = account && ["active", "approved"].includes(account.status) ? account.client : null;
  const orders = client?.user?.orders || [];

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
      <header className="rounded-lg border bg-[#03111D] p-7 text-white shadow-xl lg:p-8">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#24C8EE]">Portal Terraqo</p>
        <h1 className="mt-3 font-display text-4xl font-bold">Operaciones comerciales</h1>
        <p className="mt-3 max-w-3xl text-white/72">
          Compras, cotizaciones, tickets, documentos y proyectos comerciales vinculados a tu cuenta dentro de este workspace.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={ShoppingCart} label="Pedidos" value={orders.length} />
          <Metric icon={FileText} label="Cotizaciones" value={client?.quotes.length || 0} />
          <Metric icon={LifeBuoy} label="Tickets" value={client?.tickets.length || 0} />
          <Metric icon={FolderKanban} label="Proyectos" value={client?.projects.length || 0} />
        </div>
      </header>

      {!client ? (
        <Card>
          <CardHeader>
            <CardTitle>No hay operaciones comerciales vinculadas aun</CardTitle>
            <CardDescription>
              Cuando compres, solicites una cotizacion o una empresa te asigne operaciones, apareceran aqui sin alterar tu perfil principal Terraqo.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
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
                      <p className="text-sm text-muted-foreground">{order.items.map((item) => `${item.quantity} x ${item.product.name}`).join(", ")}</p>
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
            <Card>
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
                    <div className="mt-4 flex flex-wrap gap-2">
                      {quote.publicToken ? <Button asChild variant="outline" size="sm"><Link href={`/cotizaciones/${quote.publicToken}`}>Ver detalle</Link></Button> : null}
                      <Button asChild variant="outline" size="sm"><Link href={`/api/quotes/${quote.id}/pdf`} target="_blank">Descargar PDF</Link></Button>
                      {quote.publicToken ? (
                        <>
                          <form action={respondPublicQuoteFromFormAction.bind(null, quote.publicToken)}>
                            <input type="hidden" name="status" value="ACCEPTED" />
                            <input type="hidden" name="redirectTo" value="/portal/operaciones?success=quote_accepted" />
                            <SubmitButton size="sm" pendingText="Aceptando...">Aceptar</SubmitButton>
                          </form>
                          <form action={respondPublicQuoteFromFormAction.bind(null, quote.publicToken)}>
                            <input type="hidden" name="status" value="REJECTED" />
                            <input type="hidden" name="redirectTo" value="/portal/operaciones?success=quote_rejected" />
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
                <CardTitle>Tickets activos</CardTitle>
                <CardDescription>Seguimiento con equipos comerciales, soporte y operaciones.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {client.tickets.map((ticket) => (
                  <div key={ticket.id} className="rounded-lg border bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-display text-lg font-bold">{ticket.code}</p>
                        <p className="text-sm text-muted-foreground">{ticket.subject}</p>
                        <p className="mt-2 text-xs text-muted-foreground">Responsable: {ticket.assignedProfile?.displayName || "Pendiente de asignacion"}</p>
                      </div>
                      <StatusBadge status={ticket.status} />
                    </div>
                  </div>
                ))}
                {!client.tickets.length ? <p className="text-sm text-muted-foreground">Todavia no tienes tickets.</p> : null}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Proyectos vinculados</CardTitle>
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
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium">{document.title}</span>
                  </Link>
                ))}
                {!client.documents.length ? <p className="text-sm text-muted-foreground">No hay documentos compartidos.</p> : null}
              </CardContent>
            </Card>
          </div>
        </>
      )}
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
