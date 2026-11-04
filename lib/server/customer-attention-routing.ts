import type { Prisma } from "@prisma/client";
import { attentionState } from "../terraqo/customer-attention-config";

/** Keep membership/profile eligibility stable until the assignment commits. */
export async function eligibleAttentionRecipient(tx: Prisma.TransactionClient, workspaceId: string, profileId: string) {
 const rows = await tx.$queryRaw<Array<{ id: string; userId: string }>>`
  SELECT p.id, p."userId" FROM icc."StaffProfile" p
  JOIN icc."User" u ON u.id = p."userId"
  JOIN icc."TerraqoWorkspaceMember" m ON m."userId" = u.id AND m."workspaceId" = ${workspaceId}
  WHERE p.id = ${profileId} AND p."terraqoWorkspaceId" = ${workspaceId}
   AND p.active = true AND p.availability = 'AVAILABLE' AND m.active = true
   AND m.role IN ('OWNER','ADMIN','MANAGER')
   AND u.role IN ('TECHNICIAN','SALES','EDITOR','ADMIN','SUPER_ADMIN','COMMERCIAL_ADMIN','SUPPORT')
  FOR SHARE OF p, u, m`;
 return rows[0] || null;
}

export async function routeNewCustomerChat(tx: Prisma.TransactionClient, workspaceId: string, conversationId: string) {
 const workspace = await tx.terraqoWorkspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { settings: true, name: true } });
 const state = attentionState(workspace.settings, workspace.name);
 const profileId = state.published?.routing.defaultProfileId;
 if (!profileId) return;
 const recipient = await eligibleAttentionRecipient(tx, workspaceId, profileId);
 if (recipient) {
  // A replay or a human assignment must never be overwritten by this rule.
  const updated = await tx.chatConversation.updateMany({ where: { id: conversationId, terraqoWorkspaceId: workspaceId, assignedToId: null, assignedProfileId: null }, data: { assignedProfileId: recipient.id, assignedToId: recipient.userId } });
  if (!updated.count) return;
 }
 await tx.activityLog.create({ data: {
  terraqoWorkspaceId: workspaceId, entityType: "ChatConversation", entityId: conversationId,
  action: "UPDATED", title: recipient ? "Responsable asignado automáticamente" : "Asignación automática pendiente de revisión",
  metadata: { command: "automaticAssignment", revision: state.revision, profileId, outcome: recipient ? "assigned" : "recipient_unavailable" },
 } });
}
