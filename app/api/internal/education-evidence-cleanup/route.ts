import { prisma } from "@/lib/prisma";
import { dispatchEducationEvidenceCleanup, recoverEducationEvidenceAttempt } from "@/lib/server/education-evidence-cleanup";
import { educationEvidenceCleanupHealth, handleEducationEvidenceOperations } from "@/lib/server/education-evidence-operations";
import { getWorklogEvidenceStore } from "@/lib/server/media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
function handle(request: Request) {
  return handleEducationEvidenceOperations(request, {
    secret: process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET,
    health: () => educationEvidenceCleanupHealth(prisma),
    recover: id => recoverEducationEvidenceAttempt(prisma, id, getWorklogEvidenceStore()),
    dispatch: () => dispatchEducationEvidenceCleanup(prisma, getWorklogEvidenceStore()),
  });
}
export const GET = handle;
export const POST = handle;
