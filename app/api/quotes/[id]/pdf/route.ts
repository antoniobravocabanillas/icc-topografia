import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { formatCurrency } from "@/lib/utils";

type QuotePdfRouteProps = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: QuotePdfRouteProps) {
  const { id } = await params;
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const quote = await prisma.quote.findFirst({
    where: { id, terraqoWorkspaceId },
    include: { items: true, sellerProfile: true }
  });

  if (!quote) {
    return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
  }

  const lines = [
    "ICC TOPOGRAFIA GROUP S.A.C.",
    "Ingenieria, construccion y consultoria",
    "",
    `Cotizacion: ${quote.number}`,
    `Cliente: ${quote.customerName}`,
    quote.company ? `Empresa: ${quote.company}` : "",
    quote.customerEmail ? `Correo: ${quote.customerEmail}` : "",
    `Estado: ${quote.status}`,
    `Asesor: ${quote.sellerProfile?.displayName || "Equipo ICC"}`,
    "",
    "Detalle:",
    ...quote.items.flatMap((item) => [
      `- ${item.description}`,
      `  Cantidad: ${item.quantity} | Unitario: ${formatCurrency(Number(item.unitPrice), quote.currency)} | Subtotal: ${formatCurrency(Number(item.subtotal), quote.currency)}`
    ]),
    "",
    `Subtotal: ${formatCurrency(Number(quote.subtotal), quote.currency)}`,
    quote.discount ? `Descuento: ${formatCurrency(Number(quote.discount), quote.currency)}` : "",
    quote.tax ? `Impuesto: ${formatCurrency(Number(quote.tax), quote.currency)}` : "",
    `Total: ${formatCurrency(Number(quote.total), quote.currency)}`,
    "",
    `Terminos: ${quote.terms || "Por definir"}`,
    `Tiempo de entrega: ${quote.deliveryTime || "Por coordinar"}`,
    `Observaciones: ${quote.observations || "Sin observaciones"}`,
    "",
    "Documento generado por ICC Topografia."
  ].filter(Boolean);

  const pdf = createSimplePdf(lines);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.number}.pdf"`
    }
  });
}

function createSimplePdf(lines: string[]) {
  const escapedLines = lines.flatMap((line) => wrapLine(safePdfText(line), 88));
  const content = [
    "BT",
    "/F1 11 Tf",
    "50 790 Td",
    "14 TL",
    ...escapedLines.map((line, index) => `${index === 0 ? "" : "T*"}(${escapePdf(line)}) Tj`),
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "binary"));
}

function safePdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdf(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(value: string, limit: number) {
  if (value.length <= limit) return [value];
  const words = value.split(" ");
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    if (`${current} ${word}`.trim().length > limit) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  });
  if (current) lines.push(current);
  return lines;
}
