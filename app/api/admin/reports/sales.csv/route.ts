import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/server/authz";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export async function GET() {
  const { response } = await requireRole("SALES");
  if (response) return response;

  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  const quotes = await prisma.quote.findMany({
    where: { terraqoWorkspaceId },
    include: { sellerProfile: true, items: true },
    orderBy: { createdAt: "desc" },
    take: 1000
  });

  const header = ["numero", "cliente", "empresa", "vendedor", "estado", "total", "items", "fecha"];
  const rows = quotes.map((quote) => [
    quote.number,
    quote.customerName,
    quote.company || "",
    quote.sellerProfile?.displayName || "",
    quote.status,
    String(Number(quote.total)),
    quote.items.map((item) => item.description).join(" | "),
    quote.createdAt.toISOString()
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"icc-reportes-ventas.csv\""
    }
  });
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

