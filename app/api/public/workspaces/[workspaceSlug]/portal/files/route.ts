import { fail } from "@/lib/server/api";
import { listWorkspaceFiles, uploadWorkspaceFile } from "@/lib/server/private-workspace-storage";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";

type Context = { params: Promise<{ workspaceSlug: string }> };

export async function GET(request: Request, { params }: Context) {
  const { workspaceSlug } = await params;
  const token = getWorkspacePortalToken(request, workspaceSlug);
  if (!token) return fail("La sesion no es valida o ha vencido.", 401);
  return listWorkspaceFiles(token.sub, token.workspaceId);
}

export async function POST(request: Request, { params }: Context) {
  const { workspaceSlug } = await params;
  const token = getWorkspacePortalToken(request, workspaceSlug);
  if (!token) return fail("La sesion no es valida o ha vencido.", 401);
  return uploadWorkspaceFile(request, token.sub, token.workspaceId);
}
