import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSessionTerraqoWorkspace } from "@/lib/terraqo/workspace-scope";
import { listWorkspaceInvitations, WorkspaceInvitationError } from "@/lib/terraqo/workspace-invitations";
import { WorkspaceMembers } from "@/components/admin/workspace-members";
import { workspaceMemberCapabilities } from "@/lib/terraqo/workspace-member-management-policy";

export const dynamic = "force-dynamic";
export default async function WorkspaceMembersPage() {
  if (process.env.TERRAQO_WORKSPACE_INVITATIONS_V1 !== "true") notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");
  const workspace = await getSessionTerraqoWorkspace();
  try {
    // Read members under one authorization snapshot; invitations recheck current authority.
    const data = await prisma.$transaction(async tx => {
      const membership = await tx.terraqoWorkspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: session.user.id } }, select: { role: true, active: true } });
      if (!membership?.active || !["OWNER", "ADMIN", "MANAGER"].includes(membership.role)) throw new WorkspaceInvitationError("Acceso no autorizado.", 403);
      const owner = await tx.terraqoWorkspace.findUniqueOrThrow({ where: { id: workspace.id }, select: { ownerUserId: true } });
      const members = await tx.terraqoWorkspaceMember.findMany({ where: { workspaceId: workspace.id }, orderBy: { joinedAt: "asc" }, select: { id: true, userId: true, role: true, active: true, updatedAt: true, user: { select: { name: true, email: true } } } });
      return members.map(member => ({ id: member.id, role: member.role, active: member.active, ...member.user, updatedAt: member.updatedAt.toISOString(), isSelf: member.userId === session.user.id, allowedRoles: workspaceMemberCapabilities({ ...membership, userId: session.user.id }, member, owner.ownerUserId).roles }));
    }, {
      isolationLevel: "RepeatableRead",
      // The serverless client shares a bounded pool with the admin layout.
      // Allow queued reads to finish before acquiring this snapshot; do not
      // weaken authorization or split the permission/member read transaction.
      maxWait: 20_000,
      timeout: 15_000,
    });
    const invitations = await listWorkspaceInvitations(prisma, session.user.id, workspace.id);
    return <WorkspaceMembers workspaceId={workspace.id} name={workspace.name} members={data} invitations={invitations.map(invite => ({ id: invite.id, email: invite.email, role: invite.role, status: invite.status, expiresAt: invite.expiresAt.toISOString() }))} />;
  } catch (error) {
    if (error instanceof WorkspaceInvitationError) notFound();
    throw error;
  }
}
