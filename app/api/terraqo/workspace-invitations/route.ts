import { requireUser } from "@/lib/server/authz";
import { prisma } from "@/lib/prisma";
import { workspaceInvitationHandlers } from "@/lib/server/workspace-invitation-http";
import { sendWorkspaceInvitationEmail } from "@/lib/server/workspace-invitation-email";

export const dynamic = "force-dynamic";
const handlers = workspaceInvitationHandlers({
  db: prisma,
  deliver: sendWorkspaceInvitationEmail,
  enabled: () => process.env.TERRAQO_WORKSPACE_INVITATIONS_V1 === "true",
  actor: async () => {
    const result = await requireUser();
    return result.response ? null : result.session.user.id;
  },
});
export const GET = handlers.GET;
export const POST = handlers.POST;
