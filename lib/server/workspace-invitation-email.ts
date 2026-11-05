import { renderWorkspaceInvitationEmail } from "../../emails/terraqo-transactional";
import { terraqoDomains } from "../terraqo-domains";
import type { WorkspaceInvitationIssue } from "../terraqo/workspace-invitations";
import { sendTransactionalEmail, transactionalEmailEnabled } from "./transactional-email";

export async function sendWorkspaceInvitationEmail(issue: WorkspaceInvitationIssue): Promise<"accepted" | "disabled" | "unavailable"> {
  if (!transactionalEmailEnabled()) return "disabled";
  // The bearer link uses only the configured portal. Request and forwarded hosts are untrusted.
  const portal = new URL(terraqoDomains.portal);
  if (portal.protocol !== "https:" || portal.username || portal.password) return "unavailable";
  const link = new URL("/invitacion-workspace", portal);
  link.hash = issue.token;
  const content = await renderWorkspaceInvitationEmail(link.href, issue.expiresAt);
  const result = await sendTransactionalEmail({
    to: issue.email, subject: "Invitación a un workspace de Terraqo", ...content,
    idempotencyKey: `workspace-invitation/${issue.id}/${issue.resendCount}`,
    tags: [{ name: "category", value: "workspace_invitation" }],
  });
  if (result.delivered) return "accepted";
  return result.reason === "disabled" ? "disabled" : "unavailable";
}
