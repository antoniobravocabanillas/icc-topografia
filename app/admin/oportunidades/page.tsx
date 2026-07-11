import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { convertOpportunityToQuoteAction } from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpportunitiesPage() {
  await requireAdminPage(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  await requireWorkspaceModule("CRM", terraqoWorkspaceId);
  const opportunities = await prisma.opportunity.findMany({
    where: { deletedAt: null, terraqoWorkspaceId },
    include: {
      company: true,
      contact: true,
      sellerProfile: true,
      lead: true,
      quotes: true,
      sales: true
    },
    orderBy: { updatedAt: "desc" },
    take: 120
  });

  const openValue = opportunities
    .filter((item) => !["WON", "LOST", "ARCHIVED"].includes(item.status))
    .reduce((sum, item) => sum + Number(item.estimatedValue || 0), 0);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Workspace comercial</p>
        <h1 className="font-display text-3xl font-bold">Oportunidades</h1>
        <p className="mt-2 text-muted-foreground">Puente operativo entre lead, empresa, contacto, cotizacion y venta.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Metric title={opportunities.length} label="Oportunidades" />
        <Metric title={formatCurrency(openValue)} label="Pipeline abierto" />
        <Metric title={opportunities.filter((item) => item.quotes.length > 0).length} label="Con cotizacion" />
      </div>

      <div className="grid gap-5">
        {opportunities.map((opportunity) => (
          <Card key={opportunity.id}>
            <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>{opportunity.title}</CardTitle>
                <CardDescription>
                  {opportunity.company.tradeName || opportunity.company.legalName} | {opportunity.contact?.name || "Sin contacto"} | {opportunity.code}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={opportunity.status} />
                <span className="rounded-md border px-2 py-1 text-xs font-semibold">{opportunity.probability}%</span>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <div className="grid gap-3 md:grid-cols-3">
                <Info label="Vendedor" value={opportunity.sellerProfile?.displayName || "Sin vendedor"} />
                <Info label="Valor estimado" value={formatCurrency(Number(opportunity.estimatedValue || 0))} />
                <Info label="Proximo seguimiento" value={opportunity.nextFollowUpAt ? opportunity.nextFollowUpAt.toLocaleDateString("es-PE") : "Sin fecha"} />
                <Info label="Cotizaciones" value={String(opportunity.quotes.length)} />
                <Info label="Ventas" value={String(opportunity.sales.length)} />
                <Info label="Origen" value={opportunity.source || opportunity.lead?.source || "web"} />
              </div>

              <form action={convertOpportunityToQuoteAction.bind(null, opportunity.id)} className="grid gap-3 rounded-lg border bg-muted/20 p-4">
                <p className="font-semibold">Convertir a cotizacion</p>
                <Input name="description" placeholder="Alcance / item cotizado" defaultValue={opportunity.interest || opportunity.title} />
                <Input name="quantity" type="number" min="1" defaultValue="1" />
                <Input name="unitPrice" type="number" step="0.01" placeholder="Precio unitario" defaultValue={String(opportunity.estimatedValue || "")} />
                <Textarea name="observations" placeholder="Observaciones comerciales" defaultValue={opportunity.notes || ""} />
                <Button type="submit">
                  <FileText className="h-4 w-4" />
                  Crear cotizacion
                </Button>
                {opportunity.quotes[0]?.publicToken ? (
                  <Button asChild variant="outline">
                    <Link href={`/cotizaciones/${opportunity.quotes[0].publicToken}`} target="_blank">
                      Ver ultima cotizacion <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </form>
            </CardContent>
          </Card>
        ))}
        {!opportunities.length ? <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Convierte un lead calificado para crear la primera oportunidad.</p> : null}
      </div>
    </section>
  );
}

function Metric({ title, label }: { title: string | number; label: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{title}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

