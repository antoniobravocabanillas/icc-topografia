import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { created, fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import {
  ALLOWED_CV_FILE_TYPES,
  createProfessionalDocumentKey,
  getProfessionalDocumentStore,
  MAX_PROFESSIONAL_DOCUMENT_SIZE
} from "@/lib/server/media";
import {
  getProfessionalTaxonomy,
  professionalCategories,
  professionalTaxonomies,
  professionalTermsVersion
} from "@/lib/terraqo/professional-categories";
import { hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { publicCareerApplicationSchema } from "@/lib/validations/terraqo";

type RouteContext = {
  params: Promise<{ workspaceSlug: string }>;
};

async function getPublicWorkspace(workspaceSlug: string) {
  return prisma.terraqoWorkspace.findFirst({
    where: { slug: workspaceSlug, active: true, deletedAt: null },
    select: { id: true, slug: true, name: true, brandName: true }
  });
}

export async function GET(_: Request, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params;
    const workspace = await getPublicWorkspace(workspaceSlug);
    if (!workspace) return fail("Workspace no encontrado.", 404);

    const professionalNetworkEnabled = await hasWorkspaceModule("PROFESSIONAL_NETWORK", workspace.id);
    if (!professionalNetworkEnabled) return fail("La red profesional no esta activa para este workspace.", 404);

    const marketplaceEnabled = await hasWorkspaceModule("JOB_MARKETPLACE", workspace.id);
    const jobs = marketplaceEnabled
      ? await prisma.terraqoJobPost.findMany({
          where: {
            workspaceId: workspace.id,
            status: "OPEN",
            visibility: { in: ["PUBLIC", "COMMUNITY"] },
            deletedAt: null
          },
          select: {
            id: true,
            title: true,
            slug: true,
            summary: true,
            description: true,
            location: true,
            modality: true,
            requiredSkills: true,
            requiredTools: true,
            professionalCategories: true,
            project: { select: { title: true } }
          },
          orderBy: { createdAt: "desc" },
          take: 30
        })
      : [];

    return ok({
      workspace,
      categories: professionalCategories,
      taxonomies: professionalTaxonomies,
      acceptsGeneralApplications: true,
      jobs
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params;
    const workspace = await getPublicWorkspace(workspaceSlug);
    if (!workspace) return fail("Workspace no encontrado.", 404);

    const professionalNetworkEnabled = await hasWorkspaceModule("PROFESSIONAL_NETWORK", workspace.id);
    if (!professionalNetworkEnabled) return fail("La red profesional no esta activa para este workspace.", 403);

    const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data");
    let payload: ReturnType<typeof publicCareerApplicationSchema.parse>;
    let cvFile: File | null = null;

    if (isMultipart) {
      const formData = await request.formData();
      const rawPayload = formData.get("payload");
      if (typeof rawPayload !== "string") return fail("Faltan los datos de la postulacion.", 400);

      try {
        payload = publicCareerApplicationSchema.parse(JSON.parse(rawPayload));
      } catch {
        return fail("Los datos de la postulacion no son validos.", 400);
      }

      const candidate = formData.get("cvFile");
      cvFile = candidate instanceof File && candidate.size > 0 ? candidate : null;
    } else {
      payload = await parseJson(request, publicCareerApplicationSchema);
    }

    if (cvFile && !ALLOWED_CV_FILE_TYPES.has(cvFile.type)) {
      return fail("El CV debe estar en formato PDF, DOC o DOCX.", 400);
    }
    if (cvFile && cvFile.size > MAX_PROFESSIONAL_DOCUMENT_SIZE) {
      return fail("El CV supera el limite de 10 MB.", 400);
    }

    const taxonomy = getProfessionalTaxonomy(payload.category);
    const invalidEquipment = payload.equipment.filter((item) => !taxonomy?.equipment.includes(item));
    const invalidSoftware = payload.software.filter((item) => !taxonomy?.software.includes(item));
    if (invalidEquipment.length || invalidSoftware.length) {
      return fail("Selecciona equipos y software disponibles para la categoria profesional elegida.", 400);
    }
    const existingUser = await prisma.user.findUnique({ where: { email: payload.email }, select: { id: true } });
    if (existingUser) {
      return fail("Ya existe una cuenta con este correo. Ingresa a Portal Terraqo para continuar tu postulacion.", 409, {
        action: "sign_in",
        href: "/cuenta?callbackUrl=/portal"
      });
    }

    let selectedJob: { id: string; title: string } | null = null;
    if (payload.jobPostId) {
      const marketplaceEnabled = await hasWorkspaceModule("JOB_MARKETPLACE", workspace.id);
      if (!marketplaceEnabled) return fail("Las convocatorias no estan activas para este workspace.", 403);

      selectedJob = await prisma.terraqoJobPost.findFirst({
        where: {
          id: payload.jobPostId,
          workspaceId: workspace.id,
          status: "OPEN",
          visibility: { in: ["PUBLIC", "COMMUNITY"] },
          deletedAt: null
        },
        select: { id: true, title: true }
      });
      if (!selectedJob) return fail("La convocatoria seleccionada ya no esta disponible.", 404);
    }

    const acceptedAt = new Date();
    const passwordHash = await bcrypt.hash(payload.password, 12);
    const source = `public-careers:${workspace.slug}`;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: payload.name,
          email: payload.email,
          passwordHash,
          role: "CUSTOMER"
        },
        select: { id: true, name: true, email: true }
      });

      const profile = await tx.terraqoProfessionalProfile.create({
        data: {
          userId: user.id,
          headline: payload.roleTitle || payload.specialty,
          bio: payload.coverNote,
          city: payload.city,
          yearsExperience: payload.yearsExperience,
          professionalCategories: [payload.category],
          specialties: [payload.specialty],
          equipment: payload.equipment,
          software: payload.software,
          portfolioUrl: payload.portfolioUrl || undefined,
          cvUrl: payload.cvUrl || undefined,
          status: "OPEN_TO_PROJECTS",
          visibility: "PRIVATE",
          liveCvEnabled: false,
          liveCvVisibility: "PRIVATE",
          termsAcceptedAt: acceptedAt,
          termsVersion: professionalTermsVersion,
          privacyAcceptedAt: acceptedAt,
          onboardingSource: source
        }
      });

      await tx.terraqoWorkspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: "PROFESSIONAL",
          title: payload.roleTitle || payload.specialty,
          active: true,
          joinedAt: acceptedAt
        }
      });

      if (payload.currentCompany) {
        const matchedCompany = await tx.company.findFirst({
          where: {
            terraqoWorkspaceId: workspace.id,
            deletedAt: null,
            OR: [
              { legalName: { equals: payload.currentCompany, mode: "insensitive" } },
              { tradeName: { equals: payload.currentCompany, mode: "insensitive" } }
            ]
          },
          select: { id: true }
        });

        await tx.terraqoProfessionalAffiliation.create({
          data: {
            professionalProfileId: profile.id,
            workspaceId: workspace.id,
            companyId: matchedCompany?.id,
            companyName: payload.currentCompany,
            roleTitle: payload.currentRole,
            current: true,
            verificationStatus: matchedCompany ? "MATCHED" : "DECLARED",
            visibility: "PRIVATE"
          }
        });
      }

      const application = await tx.terraqoProjectApplication.create({
        data: {
          workspaceId: workspace.id,
          jobPostId: selectedJob?.id,
          professionalProfileId: profile.id,
          userId: user.id,
          status: "SUBMITTED",
          coverNote: payload.coverNote,
          availabilityNote: payload.availabilityNote,
          professionalCategory: payload.category,
          termsAcceptedAt: acceptedAt,
          termsVersion: professionalTermsVersion,
          privacyAcceptedAt: acceptedAt,
          source
        }
      });

      await tx.notification.create({
        data: {
          terraqoWorkspaceId: workspace.id,
          type: "SYSTEM",
          title: selectedJob ? "Nueva postulacion profesional" : "Nuevo perfil en la bolsa de talento",
          body: `${payload.name} se registro en ${payload.category}${selectedJob ? ` para ${selectedJob.title}` : ""}.`,
          href: "/admin/terraqo/red"
        }
      });

      return { user, profileId: profile.id, applicationId: application.id };
    });

    let cvDocumentId: string | null = null;
    if (cvFile) {
      const store = getProfessionalDocumentStore();
      const storageKey = createProfessionalDocumentKey(result.profileId, "CV", cvFile.name);

      try {
        await store.set(storageKey, await cvFile.arrayBuffer(), {
          metadata: {
            contentType: cvFile.type,
            originalName: cvFile.name,
            size: cvFile.size,
            profileId: result.profileId,
            workspaceId: workspace.id,
            documentType: "CV",
            uploadedAt: new Date().toISOString()
          }
        });

        const document = await prisma.terraqoProfessionalDocument.create({
          data: {
            professionalProfileId: result.profileId,
            workspaceId: workspace.id,
            type: "CV",
            storageKey,
            fileName: cvFile.name,
            contentType: cvFile.type,
            size: cvFile.size
          },
          select: { id: true }
        });
        cvDocumentId = document.id;

        await prisma.terraqoProfessionalProfile.update({
          where: { id: result.profileId },
          data: { cvUrl: `/api/terraqo/professional-documents/${document.id}` }
        });
      } catch (error) {
        await store.delete(storageKey).catch(() => undefined);
        await prisma.user.delete({ where: { id: result.user.id } }).catch(() => undefined);
        throw error;
      }
    }

    return created({
      ...result,
      cvDocumentId,
      status: "SUBMITTED",
      message: "Cuenta, perfil profesional y postulacion creados correctamente.",
      portalPath: "/cuenta?callbackUrl=/portal",
      identityVerificationRequired: true
    });
  } catch (error) {
    return handleApiError(error);
  }
}
