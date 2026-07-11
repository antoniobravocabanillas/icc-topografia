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
