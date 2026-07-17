"use server";

import type { Role } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ADMIN_WORKSPACE_COOKIE, workspaceAdminMemberRoles } from "@/lib/terraqo/workspace-access";

export async function selectAdminWorkspace(formData: FormData) {
  const session = await auth();
  const role = session?.user?.role as Role | undefined;
  const workspaceId = String(formData.get("workspaceId") || "");
  const requestedReturnTo = String(formData.get("returnTo") || "/admin");
  const returnTo = requestedReturnTo.startsWith("/admin") ? requestedReturnTo : "/admin";

  if (!session?.user?.id || !role || !workspaceId) throw new Error("Sesion o workspace invalido.");

  const allowed = role === "SUPER_ADMIN"
    ? await prisma.terraqoWorkspace.findFirst({ where: { id: workspaceId, active: true, deletedAt: null }, select: { id: true } })
    : await prisma.terraqoWorkspaceMember.findFirst({
        where: {
          workspaceId,
          userId: session.user.id,
          active: true,
          role: { in: workspaceAdminMemberRoles },
          workspace: { active: true, deletedAt: null }
        },
        select: { id: true }
      });

  if (!allowed) throw new Error("No tienes permisos para operar este workspace.");

  (await cookies()).set(ADMIN_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  redirect(returnTo);
}
