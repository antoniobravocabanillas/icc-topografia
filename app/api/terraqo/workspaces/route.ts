import { prisma } from "@/lib/prisma";
import { created, handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { createTerraqoWorkspace } from "@/lib/terraqo/workspace-repository";
import { terraqoWorkspaceCreateSchema } from "@/lib/validations/terraqo";

export async function GET() {
  const { response } = await requireRole("SUPER_ADMIN");
  if (response) return response;

  try {
    const workspaces = await prisma.terraqoWorkspace.findMany({
      where: { deletedAt: null },
      include: {
        company: true,
        subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
        modules: true,
        _count: { select: { members: true, jobPosts: true, forumChannels: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    return ok(workspaces);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const { response } = await requireRole("SUPER_ADMIN");
  if (response) return response;

  try {
    const payload = await parseJson(request, terraqoWorkspaceCreateSchema);
    const workspace = await createTerraqoWorkspace(payload);
    return created(workspace);
  } catch (error) {
    return handleApiError(error);
  }
}
