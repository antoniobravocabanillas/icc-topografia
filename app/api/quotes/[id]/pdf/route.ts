import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {quotePdfScope} from "@/lib/server/quote-pdf-access";
import {renderQuotePdf} from "@/lib/server/quote-pdf";

type QuotePdfRouteProps = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(request: Request, { params }: QuotePdfRouteProps) {
  const { id } = await params;
  const scope=await quotePdfScope(request,id);
  if (!scope) return NextResponse.json({error:"Cotización no disponible"},{status:404,headers:{"Cache-Control":"private, no-store"}});
  const quote = await prisma.quote.findFirst({
    where: { id, ...scope, deletedAt:null, terraqoWorkspace:{active:true,deletedAt:null} },
    include: { items: {orderBy:{id:"asc"}}, terraqoWorkspace: {select:{name:true,brandName:true}} }
  });

  if (!quote) {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404, headers:{"Cache-Control":"private, no-store"} });
  }

  const pdf = await renderQuotePdf(quote);
  return new NextResponse(new Uint8Array(pdf).buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Disposition": `inline; filename="${quote.number.replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,80)}.pdf"`
    }
  });
}
