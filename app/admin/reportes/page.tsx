import Link from "next/link";
import type { ElementType } from "react";
import { BarChart3, Download, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReportsPage() {
  await requireAdminPage(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const [quotes, leads, tickets, commissions, products] = await Promise.all([
    prisma.quote.findMany({ where: { terraqoWorkspaceId }, include: { sellerProfile: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.lead.findMany({ where: { terraqoWorkspaceId }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.ticket.findMany({ where: { terraqoWorkspaceId }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.commission.findMany({ where: { quote: { terraqoWorkspaceId } }, include: { sellerProfile: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.product.findMany({ where: { isActive: true, terraqoWorkspaceId }, include: { category: true }, take: 300 })
  ]);
  const accepted = quotes.filter((quote) => quote.status === "ACCEPTED");
  const rejected = quotes.filter((quote) => quote.status === "REJECTED");
  const revenue = accepted.reduce((sum, quote) => sum + Number(quote.total), 0);
  const conversion = accepted.length + rejected.length ? Math.round((accepted.length / (accepted.length + rejected.length)) * 100) : 0;

  const sellerRows = Object.values(quotes.reduce<Record<string, { name: string; total: number; count: number }>>((acc, quote) => {
    const name = quote.sellerProfile?.displayName || "Sin vendedor";
    acc[name] ||= { name, total: 0, count: 0 };
    if (quote.status === "ACCEPTED") acc[name].total += Number(quote.total);
    acc[name].count += 1;
    return acc;
  }, {})).sort((a, b) => b.total - a.total);

  const leadSources = Object.values(leads.reduce<Record<string, { source: string; count: number }>>((acc, lead) => {
    const source = lead.source || "web";
    acc[source] ||= { source, count: 0 };
    acc[source].count += 1;
    return acc;
  }, {}));

  return (
    <section className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-primary">Inteligencia comercial</p>
          <h1 className="font-display text-3xl font-bold">Reportes</h1>
          <p className="mt-2 text-muted-foreground">Ventas, leads, comisiones, tickets y productos consultivos.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/api/admin/reports/sales.csv" target="_blank">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Link>
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        <Metric icon={TrendingUp} title={formatCurrency(revenue)} text="Ventas aceptadas" />
        <Metric icon={BarChart3} title={`${conversion}%`} text="Tasa de cierre" />
        <Metric icon={Users} title={String(leads.length)} text="Leads analizados" />
        <Metric icon={BarChart3} title={String(tickets.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)).length)} text="Tickets activos" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Desempeno por vendedor</CardTitle>
            <CardDescription>Cotizaciones creadas y ventas aceptadas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sellerRows.map((row) => (
              <div key={row.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{row.name}</span>
                  <span className="font-semibold">{formatCurrency(row.total)} | {row.count} cot.</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min((row.total / Math.max(revenue, 1)) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads por origen</CardTitle>
            <CardDescription>Base para campanas y atribucion.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {leadSources.map((row) => (
              <div key={row.source}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{row.source}</span>
                  <span className="font-semibold">{row.count}</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min((row.count / Math.max(leads.length, 1)) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SimpleList title="Comisiones" items={commissions.slice(0, 8).map((item) => `${item.sellerProfile.displayName}: ${formatCurrency(Number(item.amount))} - ${item.status}`)} />
        <SimpleList title="Tickets por categoria" items={ticketSummary(tickets)} />
        <SimpleList title="Productos activos" items={products.slice(0, 8).map((item) => `${item.name} - ${item.category.name}`)} />
      </div>
    </section>
  );
}

function Metric({ icon: Icon, title, text }: { icon: ElementType; title: string; text: string }) {
  return (
    <Card>
      <CardHeader>
        <Icon className="h-5 w-5 text-primary" />
        <CardTitle className="text-3xl">{title}</CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function SimpleList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {items.map((item) => <p key={item} className="rounded-md border bg-background p-3">{item}</p>)}
        {!items.length ? <p>Sin datos.</p> : null}
      </CardContent>
    </Card>
  );
}

function ticketSummary(tickets: { category: string }[]) {
  const summary = tickets.reduce<Record<string, number>>((acc, ticket) => {
    acc[ticket.category] = (acc[ticket.category] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(summary).map(([category, count]) => `${category}: ${count}`);
}
