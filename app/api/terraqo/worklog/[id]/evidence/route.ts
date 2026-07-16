import { requireUser } from "@/lib/server/authz";
import { uploadWorklogEvidence } from "@/lib/server/worklog-evidence";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { response, session } = await requireUser();
  if (response) return response;
  const { id } = await params;
  return uploadWorklogEvidence(request, session.user.id, id);
}
