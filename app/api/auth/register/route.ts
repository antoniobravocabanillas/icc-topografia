import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { created, fail, handleApiError, parseJson } from "@/lib/server/api";
import { createEmailVerificationLinkToken, sendEmailVerificationLink } from "@/lib/server/email-verification";
import { getSubdivisionName } from "@/lib/locations";
import { getDefaultModulesForTier } from "@/lib/workspace";
import { registerSchema } from "@/lib/validations/crm";

function normalizeIdentityPart(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function workspaceSlug(companyName: string, document?: string) {
  const name = companyName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 46) || "empresa";
  return `${name}-${normalizeIdentityPart(document || "empresa").slice(-8).toLowerCase()}`;
}

export async function POST(request: Request) {
  try {
    const payload = await parseJson(request, registerSchema);
    const identityType = payload.accountType === "client"
      ? "RUC"
      : payload.identityType === "OTHER"
        ? `OTHER_${normalizeIdentityPart(payload.identityTypeOther || "")}`
        : payload.identityType;
    const identityNumber = normalizeIdentityPart(payload.document || "");
    const identityKey = `${identityType}:${identityNumber}`;
    const existingUser = await prisma.user.findUnique({ where: { email: payload.email } });
    if (existingUser) {
      return fail("Ya existe una cuenta con este correo.", 409);
    }
    const existingIdentity = await prisma.user.findUnique({ where: { identityKey } });
    if (existingIdentity) {
      return fail("Este documento de identidad ya está asociado a una cuenta Terraqo.", 409);
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: payload.name,
          email: payload.email,
          passwordHash,
          identityType,
          identityNumber,
          identityKey,
          role: "CUSTOMER"
        },
        select: { id: true, name: true, email: true, role: true, createdAt: true }
      });
      const verification = await createEmailVerificationLinkToken(tx, payload.email);

      if (payload.accountType === "professional") {
        const specialty = payload.specialty?.trim();
        const equipment = payload.equipment
          ? payload.equipment.split(",").map((item) => item.trim()).filter(Boolean)
          : [];
        const software = payload.software
          ? payload.software.split(",").map((item) => item.trim()).filter(Boolean)
          : [];

        await tx.terraqoProfessionalProfile.create({
          data: {
            userId: createdUser.id,
            headline: payload.roleTitle || specialty || "Profesional tecnico",
            bio: "Perfil profesional creado desde Portal Terraqo. Pendiente de completar y validar experiencia.",
            city: payload.city,
            country: payload.country,
            region: getSubdivisionName(payload.country, payload.subdivision) || undefined,
            locationSubdivisionCode: payload.subdivision || undefined,
            locationCity: payload.city || undefined,
            yearsExperience: payload.yearsExperience,
            specialties: specialty ? [specialty] : [],
            professionalCategories: payload.roleTitle ? [payload.roleTitle] : [],
            equipment,
            software,
            portfolioUrl: payload.portfolioUrl || undefined,
            status: "OPEN_TO_PROJECTS",
            visibility: "PRIVATE",
            liveCvEnabled: false,
            onboardingSource: "TERRAQO_PUBLIC_REGISTRATION"
          }
        });

        return { ...createdUser, verificationCode: verification.code };
      }

      const companyName = payload.company || payload.name;
      const workspace = await tx.terraqoWorkspace.create({
        data: {
          name: companyName,
          brandName: companyName,
          slug: workspaceSlug(companyName, payload.document),
          type: "CLIENT_COMPANY",
          industry: payload.industry,
          ownerUserId: createdUser.id,
          country: payload.country,
          region: getSubdivisionName(payload.country, payload.subdivision) || undefined,
          locationSubdivisionCode: payload.subdivision || undefined,
          locationCity: payload.city || undefined,
          subscriptions: { create: { tier: "BASIC", status: "TRIALING", seats: 5 } },
          modules: {
            create: getDefaultModulesForTier("BASIC").map((code) => ({
              code,
              active: true,
              enabledAt: new Date(),
              config: { provisioning: { mode: "blank", version: 1, provisionedAt: new Date().toISOString() } }
            }))
          }
        }
      });
      const terraqoWorkspaceId = workspace.id;
      const company = await tx.company.create({
        data: {
          terraqoWorkspaceId,
          legalName: companyName,
          tradeName: companyName,
          document: payload.document,
          email: payload.email,
          phone: payload.phone,
          industry: payload.industry,
          city: payload.city,
          country: payload.country,
          region: getSubdivisionName(payload.country, payload.subdivision) || undefined,
          locationSubdivisionCode: payload.subdivision || undefined,
          locationCity: payload.city || undefined,
          address: [getSubdivisionName(payload.country, payload.subdivision), payload.city].filter(Boolean).join(" / ") || undefined,
          status: "pendiente_aprobacion",
          contacts: {
            create: {
              terraqoWorkspaceId,
              name: payload.name,
              email: payload.email,
              phone: payload.phone,
              isPrimary: true
            }
          }
        },
        include: { contacts: true }
      });

      await tx.terraqoWorkspace.update({ where: { id: terraqoWorkspaceId }, data: { companyId: company.id } });

      const client = await tx.client.create({
        data: {
          terraqoWorkspaceId,
          userId: createdUser.id,
          companyId: company.id,
          name: payload.name,
          company: companyName,
          document: payload.document,
          email: payload.email,
          phone: payload.phone,
          country: payload.country,
          region: getSubdivisionName(payload.country, payload.subdivision) || undefined,
          locationSubdivisionCode: payload.subdivision || undefined,
          locationCity: payload.city || undefined,
          contactName: payload.name,
          status: "pendiente_aprobacion"
        }
      });

      await tx.clientAccount.create({
        data: {
          terraqoWorkspaceId,
          userId: createdUser.id,
          companyId: company.id,
          contactId: company.contacts[0]?.id,
          clientId: client.id,
          status: "pending_approval",
          invitedAt: new Date()
        }
      });

      await tx.notification.create({
        data: {
          terraqoWorkspaceId,
          type: "SYSTEM",
          title: "Nuevo registro de cliente pendiente",
          body: `${payload.name} solicito acceso al portal para ${companyName}.`,
          href: "/admin/clientes"
        }
      });

      await tx.terraqoWorkspaceMember.create({
        data: {
          workspaceId: terraqoWorkspaceId,
          userId: createdUser.id,
          role: "OWNER",
          title: companyName,
          active: true,
          joinedAt: new Date()
        }
      });

      return { ...createdUser, verificationCode: verification.code };
    });

    const delivery = await sendEmailVerificationLink(user.email, user.verificationCode, user.name);

    return created({
      ...user,
      verificationCode: undefined,
      accountType: payload.accountType,
      emailVerificationRequired: true,
      emailDelivery: delivery.delivered ? "sent" : "provider_not_configured",
      status: payload.accountType === "professional" ? "professional_profile_created" : "pending_approval"
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target || "");
      if (target.includes("identityKey")) return fail("Este documento de identidad ya está asociado a una cuenta Terraqo.", 409);
    }
    return handleApiError(error);
  }
}
