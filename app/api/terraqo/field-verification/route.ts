import { FieldVerificationError } from "@/lib/terraqo/field-verification";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { runFieldVerificationAction } from "@/lib/server/field-verification-api";

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    // This is the professional endpoint, not the company-administration endpoint.
    // An explicit workspace must match exactly: never fall back to another tenant.
    const membership = await prisma.terraqoWorkspaceMember.findFirst({
      where: {
        userId: session.user.id,
        active: true,
        ...(workspaceId ? { workspaceId } : {}),
        workspace: { active: true, deletedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: { workspaceId: true },
    });
    if (!membership)
      return fail("No tienes un workspace activo para esta operacion.", 403);
    return ok(
      await runFieldVerificationAction({
        request,
        userId: session.user.id,
        workspaceId: membership.workspaceId,
      }),
    );
  } catch (error) {
    if (error instanceof FieldVerificationError)
      return fail(error.message, error.status, error.details);
    return handleApiError(error);
  }
}
