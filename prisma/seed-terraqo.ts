import { PrismaClient, type TerraqoPlanTier } from "@prisma/client";
import { getDefaultModulesForTier, terraqoModules, workspace } from "../lib/workspace";

const prisma = new PrismaClient();

async function main() {
  const tier: TerraqoPlanTier = "PREMIUM";
  const enabledModules = new Set(getDefaultModulesForTier(tier));

  const terraqoWorkspace = await prisma.terraqoWorkspace.upsert({
    where: { slug: workspace.defaultWorkspaceSlug },
    update: {
      name: workspace.currentUnit,
      type: "CLIENT_COMPANY",
      active: true,
      description: workspace.description,
      domain: "icctopografia.com",
      settings: {
        publicUrl: "https://icctopografia.com",
        workspaceUrl: "https://iridescent-fenglisu-d6595c.netlify.app",
        provider: "terraqo"
      }
    },
    create: {
      slug: workspace.defaultWorkspaceSlug,
      name: workspace.currentUnit,
      type: "CLIENT_COMPANY",
      active: true,
      description: workspace.description,
      domain: "icctopografia.com",
      settings: {
        publicUrl: "https://icctopografia.com",
        workspaceUrl: "https://iridescent-fenglisu-d6595c.netlify.app",
        provider: "terraqo"
      }
    }
  });

  const activeSubscription = await prisma.terraqoSubscription.findFirst({
    where: { workspaceId: terraqoWorkspace.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" }
  });

  if (activeSubscription) {
    await prisma.terraqoSubscription.update({
      where: { id: activeSubscription.id },
      data: {
        tier,
        startsAt: new Date()
      }
    });
  } else {
    await prisma.terraqoSubscription.create({
      data: {
      workspaceId: terraqoWorkspace.id,
      tier,
      status: "ACTIVE",
      startsAt: new Date()
      }
    });
  }

  for (const moduleDefinition of terraqoModules) {
    await prisma.terraqoWorkspaceModule.upsert({
      where: {
        workspaceId_code: {
          workspaceId: terraqoWorkspace.id,
          code: moduleDefinition.code
        }
      },
      update: {
        active: enabledModules.has(moduleDefinition.code),
        config: {
          label: moduleDefinition.label,
          description: moduleDefinition.description,
          minimumTier: moduleDefinition.minimumTier
        },
        enabledAt: enabledModules.has(moduleDefinition.code) ? new Date() : undefined,
        disabledAt: enabledModules.has(moduleDefinition.code) ? null : new Date()
      },
      create: {
        workspaceId: terraqoWorkspace.id,
        code: moduleDefinition.code,
        active: enabledModules.has(moduleDefinition.code),
        config: {
          label: moduleDefinition.label,
          description: moduleDefinition.description,
          minimumTier: moduleDefinition.minimumTier
        },
        enabledAt: enabledModules.has(moduleDefinition.code) ? new Date() : undefined,
        disabledAt: enabledModules.has(moduleDefinition.code) ? null : new Date()
      }
    });
  }

  const forumChannels = [
    {
      slug: "obra-y-control",
      name: "Obra y control",
      description: "Criterios de ejecucion, replanteo, control geometrico, calidad y coordinacion de frentes."
    },
    {
      slug: "tecnologia-y-datos",
      name: "Tecnologia y datos",
      description: "Herramientas, automatizacion, captura digital, software y decisiones respaldadas por datos."
    },
    {
      slug: "carrera-y-oficio",
      name: "Carrera y oficio",
      description: "Aprendizajes de campo, empleabilidad, certificaciones y desarrollo de capacidades profesionales."
    }
  ];

  for (const channel of forumChannels) {
    await prisma.terraqoForumChannel.upsert({
      where: { workspaceId_slug: { workspaceId: terraqoWorkspace.id, slug: channel.slug } },
      update: { name: channel.name, description: channel.description, visibility: "COMMUNITY", active: true },
      create: {
        workspaceId: terraqoWorkspace.id,
        slug: channel.slug,
        name: channel.name,
        description: channel.description,
        visibility: "COMMUNITY",
        active: true
      }
    });
  }

  const [demoProfessional, demoColleague] = await Promise.all([
    prisma.user.findUnique({ where: { email: "demo.profesional@terraqo.com" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "demo.colega@terraqo.com" }, select: { id: true } })
  ]);
  if (demoProfessional && demoColleague) {
    const existingTeam = await prisma.terraqoTeam.findFirst({
      where: { workspaceId: terraqoWorkspace.id, ownerUserId: demoProfessional.id, name: "Squad control y captura 3D", status: "ACTIVE" },
      select: { id: true }
    });
    if (!existingTeam) {
      const conversation = await prisma.terraqoConversation.create({
        data: {
          type: "GROUP",
          title: "Squad control y captura 3D",
          workspaceId: terraqoWorkspace.id,
          createdById: demoProfessional.id,
          participants: { create: { userId: demoProfessional.id, role: "OWNER", lastReadAt: new Date() } }
        },
        select: { id: true }
      });
      await prisma.terraqoTeam.create({
        data: {
          workspaceId: terraqoWorkspace.id,
          ownerUserId: demoProfessional.id,
          name: "Squad control y captura 3D",
          purpose: "Combinar control topografico, captura LiDAR y evidencia de campo para presentar una propuesta tecnica conjunta.",
          conversationId: conversation.id,
          members: {
            create: [
              { userId: demoProfessional.id, invitedByUserId: demoProfessional.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
              { userId: demoColleague.id, invitedByUserId: demoProfessional.id, role: "MEMBER", status: "INVITED" }
            ]
          }
        }
      });
    }
  }

  console.log(`Terraqo workspace ready: ${terraqoWorkspace.slug} (${tier})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
