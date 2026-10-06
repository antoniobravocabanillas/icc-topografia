import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { respondPublicQuoteFromFormAction } from "@/lib/server/customer-actions";
import type {Metadata} from "next";
import {FormSubmitButton} from "@/components/admin/form-submit-button";
import {transitionQuote,QuoteStateError,commercialDay} from "@/lib/server/quote-state";
import {hasWorkspaceModule} from "@/lib/terraqo/workspace-scope";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata:Metadata={title:"Propuesta comercial privada",description:"Consulta y respuesta de propuesta comercial.",robots:{index:false,follow:false},referrer:"no-referrer"};

export default async function PublicQuotePage({params,searchParams}: {params:Promise<{token:string}>;searchParams:Promise<{error?:string;success?:string}>}) {
  const {token}=await params;
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(token)) notFound();
  const where={publicToken:token,deletedAt:null,status:{not:"DRAFT" as const},terraqoWorkspace:{active:true,deletedAt:null}};
  const include={items:{orderBy:{id:"asc" as const},include:{product:true}},sellerProfile:true,client:true,terraqoWorkspace:{select:{country:true,settings:true,name:true,brandName:true}}} as const;
  let quote=await prisma.quote.findFirst({where,include});
  if (!quote || !await hasWorkspaceModule("CRM",quote.terraqoWorkspaceId)) notFound();
  if (quote.status==="SENT") {
    try {await transitionQuote({workspaceId:quote.terraqoWorkspaceId,publicToken:token,source:"public",status:"VIEWED"});}
    catch(error) {if (!(error instanceof QuoteStateError) || error.status!==409) throw error;}
    quote=await prisma.quote.findFirst({where,include});if (!quote) notFound();
  }
  const expired=!!quote.validUntil && quote.validUntil.toISOString().slice(0,10)<commercialDay(new Date(),quote.terraqoWorkspace.country,quote.terraqoWorkspace.settings);
  const canRespond=!expired && ["SENT","VIEWED"].includes(quote.status);
  const notice=await searchParams;
  const feedback=notice.error==="quote_conflict" ? "La propuesta cambió, venció o ya recibió una respuesta. Revisa el estado antes de continuar." : notice.error==="quote_review" ? "La propuesta requiere revisión comercial antes de confirmar. Contacta a tu asesor." : notice.error==="quote_unavailable" ? "La propuesta no está disponible para responder." : notice.success==="quote_accepted" ? "Aceptación registrada." : notice.success==="quote_rejected" ? "Respuesta registrada. Tu asesor podrá preparar un ajuste." : null;

  return (
    <section className="bg-[#f6fbff] py-12">
      <div className="container grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-lg border bg-[#03111D] p-8 text-white shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#24C8EE]">{quote.terraqoWorkspace.brandName || quote.terraqoWorkspace.name}</p>
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
              {feedback ? <p role="status" aria-live="polite" className="rounded-md border p-3 text-sm">{feedback}</p> : null}
              <div className="rounded-md border bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Total</p>
                <p className="mt-1 font-display text-3xl font-bold">{formatCurrency(Number(quote.total), quote.currency)}</p>
              </div>
              <p className="text-sm text-muted-foreground">Asesor: {quote.sellerProfile?.displayName || quote.terraqoWorkspace.brandName || quote.terraqoWorkspace.name}</p>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/api/quotes/${quote.id}/pdf?token=${encodeURIComponent(token)}`} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" />
                  Descargar PDF
                </Link>
              </Button>
              {canRespond ? <>
                <form action={respondPublicQuoteFromFormAction.bind(null,token)}>
                  <input type="hidden" name="version" value={quote.updatedAt.toISOString()} />
                  <input type="hidden" name="status" value="ACCEPTED" />
                  <FormSubmitButton className="w-full" idleLabel="Aceptar cotización" pendingLabel="Registrando aceptación..." />
                </form>
                <form action={respondPublicQuoteFromFormAction.bind(null,token)}>
                  <input type="hidden" name="version" value={quote.updatedAt.toISOString()} />
                  <input type="hidden" name="status" value="REJECTED" />
                  <FormSubmitButton className="w-full" variant="outline" idleLabel="Rechazar / solicitar ajuste" pendingLabel="Registrando respuesta..." />
                </form>
              </> : <p className="text-sm text-muted-foreground">{expired?"La propuesta ha vencido. Solicita una actualización a tu asesor.":"Esta propuesta ya recibió una decisión comercial."}</p>}
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
