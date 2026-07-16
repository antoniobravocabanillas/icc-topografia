import { requireUser } from "@/lib/server/authz";
import { getWorklogEvidenceFile } from "@/lib/server/worklog-evidence";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, { params }: RouteContext) {
  const { response, session } = await requireUser();
  if (response) return response;
  const { id } = await params;
  return getWorklogEvidenceFile(session.user.id, id);
}
