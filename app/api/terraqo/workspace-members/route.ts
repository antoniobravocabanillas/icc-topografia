import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/authz";
import { workspaceMemberHandler } from "@/lib/server/workspace-member-http";
export const dynamic = "force-dynamic";
export const PATCH = workspaceMemberHandler({ db: prisma, enabled: () => process.env.TERRAQO_WORKSPACE_INVITATIONS_V1 === "true", actor: async () => {
  const result = await requireUser();
  return result.response ? null : result.session.user.id;
} });
