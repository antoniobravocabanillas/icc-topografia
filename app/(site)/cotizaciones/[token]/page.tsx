import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { respondPublicQuoteFromFormAction } from "@/lib/server/customer-actions";
import { createMetadata } from "@/lib/seo";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const quote = await prisma.quote.findFirst({ where: { publicToken: token, terraqoWorkspaceId }, select: { number: true } });
  return createMetadata({
    title: quote ? `Cotizacion ${quote.number}` : "Cotizacion ICC",
    description: "Propuesta comercial privada de ICC Topografia.",
    path: `/cotizaciones/${token}`
  });
}

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const quote = await prisma.quote.findFirst({
    where: { publicToken: token, terraqoWorkspaceId },
    include: { items: { include: { product: true } }, sellerProfile: true, client: true }
  });
  if (!quote) notFound();

  if (quote.status === "SENT") {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "VIEWED", viewedAt: new Date() }
    });
  }

  return (
    <section className="bg-[#f6fbff] py-12">
      <div className="container grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-lg border bg-[#03111D] p-8 text-white shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#24C8EE]">Propuesta comercial ICC</p>
            <h1 className="mt-4 font-display text-4xl font-bold">{quote.number}</h1>
            <p className="mt-4 text-white/72">
              Cotizacion para {quote.customerName}{quote.company ? ` - ${quote.company}` : ""}. Valida hasta {quote.validUntil ? quote.validUntil.toLocaleDateString("es-PE") : "fecha por confirmar"}.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detalle de alcance</CardTitle>
              <CardDescription>Productos, servicios y condiciones comerciales.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted text-left">
                    <tr>
                      <th className="p-3">Descripcion</th>
                      <th className="p-3">Cantidad</th>
                      <th className="p-3">Precio</th>
                      <th className="p-3">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.items.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="p-3">
                          <p className="font-medium">{item.description}</p>
                          <p className="text-xs text-muted-foreground">{item.product?.brand || item.type}</p>
                        </td>
                        <td className="p-3">{item.quantity}</td>
                        <td className="p-3">{formatCurrency(Number(item.unitPrice), quote.currency)}</td>
                        <td className="p-3 font-semibold">{formatCurrency(Number(item.subtotal), quote.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
                <Info label="Terminos" value={quote.terms || "Por definir con asesor."} />
                <Info label="Entrega" value={quote.deliveryTime || "Por coordinar."} />
                <Info label="Observaciones" value={quote.observations || "Sin observaciones."} />
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
              <CardDescription>Estado y total de la propuesta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <StatusBadge status={quote.status} />
              <div className="rounded-md border bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Total</p>
                <p className="mt-1 font-display text-3xl font-bold">{formatCurrency(Number(quote.total), quote.currency)}</p>
              </div>
              <p className="text-sm text-muted-foreground">Asesor: {quote.sellerProfile?.displayName || "Equipo ICC Topografia"}</p>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/api/quotes/${quote.id}/pdf`} target="_blank">
                  <Download className="h-4 w-4" />
                  Descargar PDF
                </Link>
              </Button>
              <form action={respondPublicQuoteFromFormAction.bind(null, token)} className="grid gap-2">
                <input type="hidden" name="status" value="ACCEPTED" />
                <Button type="submit" className="w-full">
                  <CheckCircle2 className="h-4 w-4" />
                  Aceptar cotizacion
                </Button>
              </form>
              <form action={respondPublicQuoteFromFormAction.bind(null, token)}>
                <input type="hidden" name="status" value="REJECTED" />
                <Button type="submit" variant="outline" className="w-full">
                  <XCircle className="h-4 w-4" />
                  Rechazar / solicitar ajuste
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 leading-6">{value}</p>
    </div>
  );
}
