import { publicWorkCase } from "@/lib/terraqo/public-work-case";
import { selectionAccessSnapshot } from "@/lib/server/selection-access-snapshot";

export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ username: string; slug: string }> },
) {
  const { username, slug } = await params;
  const work = await publicWorkCase(username, slug);
  return Response.json(work ? { data: selectionAccessSnapshot(work) } : {}, {
    status: work ? 200 : 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}
