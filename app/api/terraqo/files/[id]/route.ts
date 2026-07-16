import { requireUser } from "@/lib/server/authz";
import { deleteWorkspaceFile, serveWorkspaceFile } from "@/lib/server/private-workspace-storage";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { response, session } = await requireUser();
  if (response) return response;
  return serveWorkspaceFile(request, session.user.id, (await params).id);
}

export async function DELETE(_: Request, { params }: Context) {
  const { response, session } = await requireUser();
  if (response) return response;
  return deleteWorkspaceFile(session.user.id, (await params).id);
}
