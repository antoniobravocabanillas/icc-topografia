import { fail } from "@/lib/server/api";
import { deletePrivateNote, updatePrivateNote } from "@/lib/server/private-workspace-storage";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";

type Context = { params: Promise<{ workspaceSlug: string; id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { workspaceSlug, id } = await params;
  const token = getWorkspacePortalToken(request, workspaceSlug);
  if (!token) return fail("La sesion no es valida o ha vencido.", 401);
  return updatePrivateNote(request, token.sub, id, token.workspaceId);
}

export async function DELETE(request: Request, { params }: Context) {
  const { workspaceSlug, id } = await params;
  const token = getWorkspacePortalToken(request, workspaceSlug);
  if (!token) return fail("La sesion no es valida o ha vencido.", 401);
  return deletePrivateNote(token.sub, id, token.workspaceId);
}
