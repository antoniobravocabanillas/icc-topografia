import { fail } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { listWorkspaceFiles, uploadWorkspaceFile } from "@/lib/server/private-workspace-storage";

export async function GET(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
  if (!workspaceId) return fail("Selecciona un workspace.", 422);
  return listWorkspaceFiles(session.user.id, workspaceId);
}

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;
  return uploadWorkspaceFile(request, session.user.id);
}
