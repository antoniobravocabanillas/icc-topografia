import { prisma } from "@/lib/prisma";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { handleEducationEvidenceRead } from "@/lib/server/education-evidence-http";
import { readEducationEvidence, downloadEducationEvidence } from "@/lib/server/education-evidence-read";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ workspaceSlug: string; educationId: string; evidenceId: string }> };
export async function GET(request: Request, context: Context) {
  return handleEducationEvidenceRead(request, await context.params, {
    authenticate: getWorkspacePortalToken,
    read: (token, id, key) => readEducationEvidence(prisma, token, id, key),
    download: (token, id, file) => downloadEducationEvidence(prisma, token, id, file),
  });
}
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
