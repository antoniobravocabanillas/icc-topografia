import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { createWorkspacePortalToken, type WorkspacePortalRole } from "@/lib/server/workspace-portal-session";

type RouteContext = { params: Promise<{ workspaceSlug: string }> };

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(100),
});

function toPortalRole(role: string): WorkspacePortalRole {
  if (role === "CLIENT" || role === "PROFESSIONAL") return role;
  return "ADMIN";
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params;
    const payload = await parseJson(request, loginSchema);
    const workspace = await prisma.terraqoWorkspace.findFirst({
      where: { slug: workspaceSlug, active: true, deletedAt: null },
      select: { id: true, slug: true, name: true, brandName: true },
    });
    if (!workspace) return fail("Workspace no encontrado.", 404);

    const user = await prisma.user.findUnique({
      where: { email: payload.email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        terraqoMemberships: {
          where: { workspaceId: workspace.id, active: true },
          select: { role: true },
          take: 1,
        },
      },
    });

    const passwordIsValid = user?.passwordHash ? await bcrypt.compare(payload.password, user.passwordHash) : false;
    const membership = user?.terraqoMemberships[0];
    if (!user || !passwordIsValid || !membership) {
      return fail("El correo o la contrasena no son correctos para este portal.", 401);
    }

    const role = toPortalRole(membership.role);
    const session = createWorkspacePortalToken({
      sub: user.id,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      role,
    });

    return ok({
      ...session,
      workspace,
      user: { id: user.id, name: user.name, email: user.email, role: role.toLowerCase() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
