import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { created, fail, handleApiError, parseJson } from "@/lib/server/api";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { registerSchema } from "@/lib/validations/crm";

export async function POST(request: Request) {
  try {
    const payload = await parseJson(request, registerSchema);
    const existingUser = await prisma.user.findUnique({ where: { email: payload.email } });
    if (existingUser) {
      return fail("Ya existe una cuenta con este correo.", 409);
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    if (!terraqoWorkspaceId) return fail("Workspace Terraqo no configurado", 500);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: payload.name,
          email: payload.email,
          passwordHash,
          role: "CUSTOMER"
        },
        select: { id: true, name: true, email: true, role: true, createdAt: true }
      });

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
            yearsExperience: payload.yearsExperience,
            specialties: specialty ? [specialty] : [],
            equipment,
            software,
            portfolioUrl: payload.portfolioUrl || undefined,
            status: "OPEN_TO_PROJECTS",
            visibility: "PRIVATE",
            liveCvEnabled: false
          }
        });

        await tx.terraqoWorkspaceMember.create({
          data: {
            workspaceId: terraqoWorkspaceId,
            userId: createdUser.id,
            role: "PROFESSIONAL",
            title: payload.roleTitle || specialty || "Profesional tecnico",
            active: true,
            joinedAt: new Date()
          }
        });

        await tx.notification.create({
          data: {
            terraqoWorkspaceId,
            type: "SYSTEM",
            title: "Nuevo profesional registrado en Terraqo",
            body: `${payload.name} creo un perfil profesional para la red Terraqo.`,
            href: "/admin/terraqo"
          }
        });

        return createdUser;
      }

      const companyName = payload.company || payload.name;
      const company = await tx.company.create({
        data: {
          terraqoWorkspaceId,
          legalName: companyName,
          tradeName: companyName,
          document: payload.document,
          email: payload.email,
          phone: payload.phone,
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
          role: "CLIENT",
          title: companyName,
          active: true,
          joinedAt: new Date()
        }
      });

      return createdUser;
    });

    return created({
      ...user,
      accountType: payload.accountType,
      status: payload.accountType === "professional" ? "professional_profile_created" : "pending_approval"
    });
  } catch (error) {
    return handleApiError(error);
  }
}
