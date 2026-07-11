import Link from "next/link";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { createQuoteAction, updateQuoteStatusAction } from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

const quoteStatuses = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminQuotesPage() {
  await requireAdminPage(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  await requireWorkspaceModule("CRM", terraqoWorkspaceId);
  const [quotes, sellers, products, leads, opportunities] = await Promise.all([
    prisma.quote.findMany({
      where: { deletedAt: null, terraqoWorkspaceId },
      include: { sellerProfile: true, items: true, lead: true, companyRef: true, contact: true, opportunity: true, sale: true },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.staffProfile.findMany({ where: { department: "SALES", active: true }, orderBy: { displayName: "asc" } }),
    prisma.product.findMany({ where: { isActive: true, terraqoWorkspaceId }, orderBy: { name: "asc" }, take: 120 }),
    prisma.lead.findMany({ where: { deletedAt: null, terraqoWorkspaceId }, orderBy: { createdAt: "desc" }, take: 80 }),
    prisma.opportunity.findMany({
      where: { deletedAt: null, terraqoWorkspaceId, status: { in: ["OPEN", "DISCOVERY", "PROPOSAL", "NEGOTIATION"] } },
      include: { company: true },
      orderBy: { createdAt: "desc" },
      take: 80
    })
  ]);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Cotizador B2B</p>
        <h1 className="font-display text-3xl font-bold">Cotizaciones</h1>
        <p className="mt-2 text-muted-foreground">Genera propuestas comerciales, asignalas a vendedores y dispara comisiones al aceptar.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva cotizacion rapida</CardTitle>
          <CardDescription>Base inicial para propuesta; luego podra evolucionar a PDF y portal cliente.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createQuoteAction} className="grid gap-3 md:grid-cols-3">
            <Input name="customerName" placeholder="Cliente" required />
            <Input name="customerEmail" type="email" placeholder="Correo" />
            <Input name="company" placeholder="Empresa" />
            <select name="sellerProfileId" className="h-11 rounded-md border bg-background px-3 text-sm">
              <option value="">Vendedor responsable</option>
              {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.displayName}</option>)}
            </select>
            <select name="leadId" className="h-11 rounded-md border bg-background px-3 text-sm">
              <option value="">Lead relacionado</option>
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name} - {lead.company || lead.email}</option>)}
            </select>
            <select name="opportunityId" className="h-11 rounded-md border bg-background px-3 text-sm">
              <option value="">Oportunidad relacionada</option>
              {opportunities.map((opportunity) => (
                <option key={opportunity.id} value={opportunity.id}>{opportunity.code} - {opportunity.company.tradeName || opportunity.company.legalName}</option>
              ))}
            </select>
            <Input name="validUntil" type="date" />
            <select name="productId" className="h-11 rounded-md border bg-background px-3 text-sm">
              <option value="">Producto opcional</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            <Input name="description" placeholder="Producto, servicio o alcance" required />
            <Input name="quantity" type="number" defaultValue="1" min="1" />
            <Input name="unitPrice" type="number" step="0.01" placeholder="Precio unitario" />
            <Input name="discount" type="number" step="0.01" placeholder="Descuento" />
            <Input name="tax" type="number" step="0.01" placeholder="Impuesto" />
            <Input name="deliveryTime" placeholder="Tiempo de entrega" />
            <Textarea name="terms" placeholder="Terminos comerciales" />
            <Textarea name="observations" placeholder="Observaciones internas o para cliente" />
            <Button type="submit" className="md:col-span-3">Crear cotizacion</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline de cotizaciones</CardTitle>
          <CardDescription>{quotes.length} cotizaciones registradas.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Numero</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Oportunidad / venta</th>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3">Items</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id} className="border-t align-top">
                    <td className="p-3 font-semibold">{quote.number}</td>
                    <td className="p-3">
                      <div>{quote.customerName}</div>
                      <div className="text-xs text-muted-foreground">{quote.companyRef?.tradeName || quote.companyRef?.legalName || quote.company || quote.customerEmail || "-"}</div>
                    </td>
                    <td className="p-3">
                      <div>{quote.opportunity?.code || "Sin oportunidad"}</div>
                      <div className="text-xs text-muted-foreground">{quote.sale?.number ? `Venta ${quote.sale.number}` : "Venta pendiente"}</div>
                    </td>
                    <td className="p-3">{quote.sellerProfile?.displayName || "-"}</td>
                    <td className="p-3">{quote.items.map((item) => item.description).join(", ")}</td>
                    <td className="p-3 font-semibold">{quote.currency} {Number(quote.total).toLocaleString("en-US")}</td>
                    <td className="p-3"><StatusBadge status={quote.status} /></td>
                    <td className="p-3 space-y-2">
                      <form action={updateQuoteStatusAction.bind(null, quote.id)} className="flex gap-2">
                        <select name="status" defaultValue={quote.status} className="h-9 rounded-md border bg-background px-2 text-xs">
                          {quoteStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                        <Button type="submit" size="sm" variant="outline">Guardar</Button>
                      </form>
                      <div className="flex flex-wrap gap-2">
                        {quote.publicToken ? <Button asChild size="sm" variant="outline"><Link href={`/cotizaciones/${quote.publicToken}`} target="_blank">Link cliente</Link></Button> : null}
                        <Button asChild size="sm" variant="outline"><Link href={`/api/quotes/${quote.id}/pdf`} target="_blank">PDF</Link></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!quotes.length ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Todavia no hay cotizaciones.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
