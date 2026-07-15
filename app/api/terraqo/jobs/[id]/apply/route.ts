import { created, fail, handleApiError } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const { id } = await params;
    const profile = await prisma.terraqoProfessionalProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, termsAcceptedAt: true, privacyAcceptedAt: true }
    });
    if (!profile) return fail("Completa tu perfil profesional antes de postular.", 409);
    if (!profile.termsAcceptedAt || !profile.privacyAcceptedAt) return fail("Debes aceptar los terminos y la politica de privacidad.", 409);

    const job = await prisma.terraqoJobPost.findFirst({
      where: { id, status: "OPEN", deletedAt: null, visibility: { in: ["PUBLIC", "COMMUNITY", "WORKSPACE"] } },
      select: { id: true, workspaceId: true }
    });
    if (!job) return fail("La oportunidad ya no esta disponible.", 404);
    await requireWorkspaceModule("JOB_MARKETPLACE", job.workspaceId);

    return created(await prisma.terraqoProjectApplication.upsert({
      where: { jobPostId_professionalProfileId: { jobPostId: job.id, professionalProfileId: profile.id } },
      update: { status: "SUBMITTED", userId: session.user.id },
      create: {
        workspaceId: job.workspaceId,
        jobPostId: job.id,
        professionalProfileId: profile.id,
        userId: session.user.id,
        status: "SUBMITTED",
        termsAcceptedAt: new Date(),
        termsVersion: "terraqo-market-v1",
        privacyAcceptedAt: new Date(),
        source: "terraqo-market"
      }
    }));
  } catch (error) {
    return handleApiError(error);
  }
}
