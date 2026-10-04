import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { createRevocablePortalToken } from "@/lib/server/workspace-portal-session";
import { toWorkspacePortalRole } from "@/lib/server/workspace-portal-policy";
import { reservePortalLoginAttempt, PORTAL_LOGIN_WINDOW_SECONDS } from "@/lib/server/portal-login-limit";

type RouteContext = { params: Promise<{ workspaceSlug: string }> };

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(100),
});

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

    const membership = user?.terraqoMemberships[0];
    if (!user?.passwordHash || !membership) {
      return fail("El correo o la contrasena no son correctos para este portal.", 401);
    }
    if (!await reservePortalLoginAttempt(workspace.id, user.id)) return Response.json({ error: {
      message: "Demasiados intentos. Espera unos minutos antes de volver a ingresar.",
    } }, { status: 429, headers: { "Retry-After": String(PORTAL_LOGIN_WINDOW_SECONDS), "Cache-Control": "private, no-store" } });
    if (!await bcrypt.compare(payload.password, user.passwordHash))
      return fail("El correo o la contrasena no son correctos para este portal.", 401);

    const role = toWorkspacePortalRole(membership.role);
    if (!role) return fail("Tu membresia no permite acceder a este portal.", 403);
    const session = await createRevocablePortalToken({
      sub: user.id,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      role,
    });

    return ok({
      ...session,
      workspace,
      user: { id: user.id, name: user.name, email: user.email, role: role.toLowerCase() },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
