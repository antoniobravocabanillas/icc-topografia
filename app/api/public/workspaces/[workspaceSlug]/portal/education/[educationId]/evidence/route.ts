import { prisma } from "@/lib/prisma";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";
import { handleEducationEvidenceRead } from "@/lib/server/education-evidence-http";
import { readEducationEvidence, downloadEducationEvidence } from "@/lib/server/education-evidence-read";
import { handleEducationUpload } from "@/lib/server/education-upload-http";
import { uploadEducationEvidence } from "@/lib/server/education-evidence-upload";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ workspaceSlug: string; educationId: string }> };
export async function GET(request: Request, context: Context) {
  return handleEducationEvidenceRead(request, await context.params, {
    authenticate: getWorkspacePortalToken,
    read: (token, id, key) => readEducationEvidence(prisma, token, id, key),
    download: (token, id, file) => downloadEducationEvidence(prisma, token, id, file),
  });
}
export async function POST(request: Request, context: Context) {
  return handleEducationUpload(request, await context.params, {
    authenticate: getWorkspacePortalToken,
    upload: (input, token, id, budget) => uploadEducationEvidence(input, token, id, prisma, undefined, budget),
  });
}
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
