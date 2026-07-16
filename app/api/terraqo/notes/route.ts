import { requireUser } from "@/lib/server/authz";
import { createPrivateNote, listPrivateNotes } from "@/lib/server/private-workspace-storage";
import { fail } from "@/lib/server/api";

export async function GET(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
  if (!workspaceId) return fail("Selecciona un workspace.", 422);
  return listPrivateNotes(session.user.id, workspaceId);
}

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  return createPrivateNote(request, session.user.id);
}
