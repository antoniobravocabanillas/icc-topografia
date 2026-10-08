import { prisma } from "@/lib/prisma";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { handleEducationWithdrawal } from "@/lib/server/education-withdrawal-http";
import { readEducationWithdrawal } from "@/lib/server/education-withdrawal-read";
import { withdrawEducationEvidence } from "@/lib/server/education-evidence-withdrawal";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ workspaceSlug: string; educationId: string }> };
export async function GET(request: Request, context: Context) {
  return handleEducationWithdrawal(request, await context.params, {
    authenticate: getWorkspacePortalToken, read: (token, id, key) => readEducationWithdrawal(prisma, token, id, key),
    withdraw: (token, id, payload) => withdrawEducationEvidence(prisma, token, id, payload),
  });
}
export const POST = GET; export const PUT = GET; export const PATCH = GET; export const DELETE = GET;
