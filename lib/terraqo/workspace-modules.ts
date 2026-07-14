import type { Prisma, TerraqoModuleCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type WorkspaceProvisioningMode = "blank" | "template";

type ModuleConfig = {
  provisioning?: {
    mode?: WorkspaceProvisioningMode;
    version?: number;
    provisionedAt?: string;
  };
  [key: string]: unknown;
};

function asConfig(value: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined): ModuleConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ModuleConfig;
}

function provisioningMode(config: ModuleConfig, fallback: WorkspaceProvisioningMode = "blank") {
  return config.provisioning?.mode === "template" ? "template" : fallback;
}

async function provisionProjectsTemplate(tx: Prisma.TransactionClient, workspaceId: string) {
  const workspace = await tx.terraqoWorkspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true }
  });
  if (!workspace) throw new Error("Workspace no encontrado.");

  const slug = `${workspace.slug}-proyecto-ejemplo`;
  const existing = await tx.project.findFirst({
    where: { terraqoWorkspaceId: workspaceId, slug },
    select: { id: true }
  });
  if (existing) return;

  await tx.project.create({
    data: {
      terraqoWorkspaceId: workspaceId,
      title: "Proyecto de ejemplo",
      slug,
      category: "Plantilla",
      servicesApplied: [],
      summary: "Plantilla privada para conocer la estructura de un proyecto en Terraqo.",
      description: "Edita o elimina este proyecto antes de comenzar a registrar la operacion real del workspace.",
      status: "PLANNING",
      isPublic: false,
      isFeatured: false
    }
  });
}

const templateProvisioners: Partial<Record<TerraqoModuleCode, (tx: Prisma.TransactionClient, workspaceId: string) => Promise<void>>> = {
  PROJECTS: provisionProjectsTemplate
};

export async function setWorkspaceModuleState(input: {
  workspaceId: string;
  code: TerraqoModuleCode;
  active: boolean;
  config?: Prisma.InputJsonValue;
  mode?: WorkspaceProvisioningMode;
}) {
  const previous = await prisma.terraqoWorkspaceModule.findUnique({
    where: { workspaceId_code: { workspaceId: input.workspaceId, code: input.code } },
    select: { active: true, config: true }
  });
  const incomingConfig = asConfig(input.config);
  const previousConfig = asConfig(previous?.config);
  const mode = input.mode ?? provisioningMode(incomingConfig, provisioningMode(previousConfig));
  const shouldProvision = input.active && !previous?.active;
  const now = new Date();
  const mergedConfig: ModuleConfig = {
    ...previousConfig,
    ...incomingConfig,
    provisioning: {
      ...previousConfig.provisioning,
      ...incomingConfig.provisioning,
      mode,
      version: 1,
      ...(shouldProvision ? { provisionedAt: now.toISOString() } : {})
    }
  };

  return prisma.$transaction(async (tx) => {
    if (shouldProvision && mode === "template") {
      await templateProvisioners[input.code]?.(tx, input.workspaceId);
    }

    return tx.terraqoWorkspaceModule.upsert({
      where: { workspaceId_code: { workspaceId: input.workspaceId, code: input.code } },
      update: {
        active: input.active,
        config: mergedConfig as Prisma.InputJsonValue,
        enabledAt: input.active ? now : undefined,
        disabledAt: input.active ? null : now
      },
      create: {
        workspaceId: input.workspaceId,
        code: input.code,
        active: input.active,
        config: mergedConfig as Prisma.InputJsonValue,
        enabledAt: input.active ? now : undefined,
        disabledAt: input.active ? undefined : now
      }
    });
  });
}
