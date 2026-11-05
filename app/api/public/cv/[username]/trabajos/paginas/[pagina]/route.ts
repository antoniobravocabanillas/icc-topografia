import { publicWorkCaseCards } from "@/lib/terraqo/public-work-case";
import { selectionAccessSnapshot } from "@/lib/server/selection-access-snapshot";

export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ username: string; pagina: string }> },
) {
  const { username, pagina } = await params;
  const after = /^desde-([a-zA-Z0-9_-]{1,160})$/.exec(pagina)?.[1];
  if (pagina !== "resumen" && pagina !== "inicio" && !after)
    return new Response(null, { status: 404 });
  const { cards, hasMore } = await publicWorkCaseCards(
    username,
    pagina === "resumen" ? 2 : 12,
    after,
  );
  return Response.json(
    {
      data: selectionAccessSnapshot({
        cards,
        hasMore: pagina === "resumen" ? undefined : hasMore,
      }),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
