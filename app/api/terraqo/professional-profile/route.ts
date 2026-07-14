import { prisma } from "@/lib/prisma";
import { handleApiError, ok, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { terraqoProfessionalProfileSchema } from "@/lib/validations/terraqo";

export async function GET() {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const profile = await prisma.terraqoProfessionalProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        documents: {
          orderBy: { uploadedAt: "desc" },
          select: {
            id: true,
            type: true,
            fileName: true,
            reviewStatus: true,
            reviewNote: true,
            uploadedAt: true,
            reviewedAt: true
          }
        },
        experiences: { orderBy: { startedAt: "desc" } },
        affiliations: { orderBy: [{ current: "desc" }, { updatedAt: "desc" }] },
        applications: {
          include: {
            workspace: { select: { id: true, name: true, slug: true } },
            jobPost: { select: { id: true, title: true, slug: true, status: true, workspaceId: true } }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    return ok(profile);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const payload = await parseJson(request, terraqoProfessionalProfileSchema);
    const profile = await prisma.terraqoProfessionalProfile.upsert({
      where: { userId: session.user.id },
      update: payload,
      create: {
        userId: session.user.id,
        ...payload
      }
    });

    return ok(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
