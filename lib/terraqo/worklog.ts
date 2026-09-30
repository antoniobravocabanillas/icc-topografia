import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { terraqoWorklogCreateSchema } from "@/lib/validations/terraqo";
import {
  awardAutomatedBuilderContribution,
  syncWorklogReputation,
} from "@/lib/terraqo/builders";

export const worklogInclude = {
  author: { select: { id: true, name: true, image: true } },
  professionalProfile: {
    select: {
      id: true,
      headline: true,
      city: true,
      status: true,
      identityVerificationStatus: true,
    },
  },
  workspace: {
    select: {
      id: true,
      slug: true,
      name: true,
      brandName: true,
      logoUrl: true,
    },
  },
  project: { select: { id: true, slug: true, title: true } },
  previousWorklog: { select: { id: true, title: true, occurredAt: true } },
  nextWorklog: { select: { id: true, title: true, occurredAt: true } },
  media: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      fileName: true,
      contentType: true,
      size: true,
      sortOrder: true,
      createdAt: true,
    },
  },
  comments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { author: { select: { id: true, name: true, image: true } } },
  },
  reactions: { select: { id: true, userId: true, type: true } },
  validations: {
    orderBy: { requestedAt: "desc" },
    take: 3,
    include: {
      validator: { select: { id: true, name: true, image: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  },
  _count: { select: { comments: true, reactions: true } },
} satisfies Prisma.TerraqoWorklogEntryInclude;

export type WorklogWithContext = Prisma.TerraqoWorklogEntryGetPayload<{
  include: typeof worklogInclude;
}>;

export class TerraqoWorklogError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "TerraqoWorklogError";
  }
}

export async function getProfessionalNetworkContext(userId: string) {
  const [profile, memberships] = await Promise.all([
    prisma.terraqoProfessionalProfile.findUnique({
      where: { userId },
      select: { id: true, visibility: true, liveCvEnabled: true },
    }),
    prisma.terraqoWorkspaceMember.findMany({
      where: {
        userId,
        active: true,
        workspace: { active: true, deletedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        workspaceId: true,
        role: true,
        title: true,
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
            brandName: true,
            logoUrl: true,
            industry: true,
            modules: { where: { active: true }, select: { code: true } },
          },
        },
      },
    }),
  ]);

  return { profile, memberships };
}

export function visibleWorklogWhere(
  userId: string,
  workspaceIds: string[],
): Prisma.TerraqoWorklogEntryWhereInput {
  return {
    deletedAt: null,
    OR: [
      { authorId: userId },
      { visibility: "PUBLIC" },
      { visibility: "COMMUNITY" },
      ...(workspaceIds.length
        ? [
            {
              visibility: "WORKSPACE" as const,
              workspaceId: { in: workspaceIds },
            },
          ]
        : []),
    ],
    AND: [
      {
        OR: [
          { workspaceId: null },
          {
            workspace: {
              modules: { some: { code: "PROFESSIONAL_NETWORK", active: true } },
            },
          },
        ],
      },
    ],
  };
}

export async function getVisibleWorklogs(userId: string, take = 30) {
  const context = await getProfessionalNetworkContext(userId);
  if (!context.profile)
    return { ...context, worklogs: [] as WorklogWithContext[] };

  const workspaceIds = context.memberships.map(
    (membership) => membership.workspaceId,
  );
  const worklogs = await prisma.terraqoWorklogEntry.findMany({
    where: visibleWorklogWhere(userId, workspaceIds),
    include: worklogInclude,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take,
  });

  return { ...context, worklogs };
}

export async function canViewWorklog(userId: string, worklogId: string) {
  const memberships = await prisma.terraqoWorkspaceMember.findMany({
    where: { userId, active: true },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  return prisma.terraqoWorklogEntry.findFirst({
    where: { id: worklogId, ...visibleWorklogWhere(userId, workspaceIds) },
    select: { id: true, authorId: true, workspaceId: true },
  });
}

export async function createProfessionalWorklog(input: {
  userId: string;
  payload: z.infer<typeof terraqoWorklogCreateSchema>;
  requiredWorkspaceId?: string;
}) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: input.userId },
    select: { id: true },
  });
  if (!profile)
    throw new TerraqoWorklogError(
      "Completa tu perfil profesional antes de publicar una bitacora.",
      409,
    );

  const workspaceId = input.requiredWorkspaceId || input.payload.workspaceId;
  if (
    input.requiredWorkspaceId &&
    input.payload.workspaceId &&
    input.payload.workspaceId !== input.requiredWorkspaceId
  ) {
    throw new TerraqoWorklogError(
      "El workspace de la publicacion no coincide con tu sesion.",
      403,
    );
  }

  if (workspaceId) {
    const membership = await prisma.terraqoWorkspaceMember.findFirst({
      where: { workspaceId, userId: input.userId, active: true },
      select: { id: true },
    });
    if (!membership)
      throw new TerraqoWorklogError(
        "No perteneces al workspace seleccionado.",
        403,
      );
    await requireWorkspaceModule("PROFESSIONAL_NETWORK", workspaceId);
    await requireWorkspaceModule("LIVE_CV", workspaceId);
  }

  if (input.payload.projectId) {
    if (!workspaceId)
      throw new TerraqoWorklogError("El proyecto requiere un workspace.", 422);
    const project = await prisma.project.findFirst({
      where: {
        id: input.payload.projectId,
        terraqoWorkspaceId: workspaceId,
        deletedAt: null,
        OR: [
          {
            terraqoExperiences: { some: { professionalProfileId: profile.id } },
          },
          {
            terraqoJobPosts: {
              some: {
                applications: {
                  some: {
                    professionalProfileId: profile.id,
                    status: "ACCEPTED",
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!project)
      throw new TerraqoWorklogError(
        "El proyecto no esta asignado a tu perfil profesional.",
        403,
      );
  }

  if (input.payload.previousWorklogId) {
    const previous = await prisma.terraqoWorklogEntry.findFirst({
      where: {
        id: input.payload.previousWorklogId,
        professionalProfileId: profile.id,
        authorId: input.userId,
        deletedAt: null,
        nextWorklog: null,
      },
      select: { id: true },
    });
    if (!previous) {
      throw new TerraqoWorklogError(
        "La bitacora anterior debe ser tuya y no tener otra continuacion.",
        422,
      );
    }
  }

  const fingerprintSource =
    `${input.payload.title}|${input.payload.summary}|${input.payload.projectId || ""}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const contentFingerprint = createHash("sha256")
    .update(fingerprintSource)
    .digest("hex");
  const worklog = await prisma.terraqoWorklogEntry.create({
    data: {
      professionalProfileId: profile.id,
      authorId: input.userId,
      workspaceId,
      projectId: input.payload.projectId,
      previousWorklogId: input.payload.previousWorklogId,
      title: input.payload.title,
      summary: input.payload.summary,
      outcome: input.payload.outcome,
      type: input.payload.type,
      visibility: input.payload.visibility,
      skills: input.payload.skills,
      evidenceUrls: input.payload.evidenceUrls,
      locationLabel: input.payload.locationLabel,
      latitude: input.payload.latitude,
      longitude: input.payload.longitude,
      locationAccuracyMeters: input.payload.locationAccuracyMeters,
      locationCapturedAt: input.payload.locationCapturedAt,
      contentFingerprint,
      occurredAt: new Date(),
      evidenceStatus: input.payload.projectId ? "LINKED" : "DECLARED",
    },
    include: worklogInclude,
  });
  const priorWorklogs = await prisma.terraqoWorklogEntry.count({
    where: { authorId: input.userId, deletedAt: null },
  });
  if (priorWorklogs === 1) {
    try {
      await awardAutomatedBuilderContribution({
        userId: input.userId,
        type: "FIRST_WORKLOG",
        sourceKey: `first-worklog:${input.userId}`,
        title: "Primera bitácora útil",
        detail: `Primera evidencia profesional registrada: ${worklog.title}.`,
      });
    } catch (error) {
      console.warn(
        "No se pudo acreditar la primera bitácora en Terraqo Builders.",
        error,
      );
    }
  }
  try {
    await syncWorklogReputation(worklog.id);
  } catch (error) {
    console.warn(
      "No se pudo calcular la confianza inicial de la bitácora.",
      error,
    );
  }
  return worklog;
}

export async function setWorklogContinuity(input: {
  userId: string;
  worklogId: string;
  previousWorklogId: string | null;
}) {
  if (!input.previousWorklogId) {
    const current = await prisma.terraqoWorklogEntry.findFirst({
      where: { id: input.worklogId, authorId: input.userId, deletedAt: null },
      select: { id: true },
    });
    if (!current) throw new TerraqoWorklogError("Bitacora no encontrada.", 404);
    return prisma.terraqoWorklogEntry.update({
      where: { id: current.id },
      data: { previousWorklogId: null },
      include: worklogInclude,
    });
  }
  if (input.previousWorklogId === input.worklogId) {
    throw new TerraqoWorklogError(
      "Una bitacora no puede enlazarse consigo misma.",
      422,
    );
  }

  return prisma.$transaction(async (tx) => {
    const entries = await tx.terraqoWorklogEntry.findMany({
      where: { authorId: input.userId, deletedAt: null },
      select: {
        id: true,
        previousWorklogId: true,
        workspaceId: true,
        projectId: true,
        occurredAt: true,
        createdAt: true,
      },
    });
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const current = byId.get(input.worklogId);
    const selected = byId.get(input.previousWorklogId!);
    if (!current) throw new TerraqoWorklogError("Bitacora no encontrada.", 404);
    if (!selected) {
      throw new TerraqoWorklogError(
        "Solo puedes enlazar bitacoras de tu propio perfil.",
        422,
      );
    }
    if (
      current.projectId &&
      selected.projectId &&
      current.projectId !== selected.projectId
    ) {
      throw new TerraqoWorklogError(
        "Las bitacoras pertenecen a proyectos distintos.",
        422,
      );
    }
    if (
      current.workspaceId &&
      selected.workspaceId &&
      current.workspaceId !== selected.workspaceId
    ) {
      throw new TerraqoWorklogError(
        "Las bitacoras pertenecen a espacios de trabajo distintos.",
        422,
      );
    }

    const nextByPrevious = new Map<string, string>();
    for (const entry of entries) {
      if (entry.previousWorklogId)
        nextByPrevious.set(entry.previousWorklogId, entry.id);
    }
    const chainIds = new Set<string>();
    const collectChain = (seedId: string) => {
      let rootId = seedId;
      for (let depth = 0; depth < 100; depth += 1) {
        const previousId = byId.get(rootId)?.previousWorklogId;
        if (!previousId || !byId.has(previousId)) break;
        rootId = previousId;
      }
      let cursorId: string | undefined = rootId;
      for (let depth = 0; cursorId && depth < 100; depth += 1) {
        chainIds.add(cursorId);
        cursorId = nextByPrevious.get(cursorId);
      }
    };
    collectChain(current.id);
    collectChain(selected.id);

    const ordered = [...chainIds]
      .map((id) => byId.get(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort(
        (left, right) =>
          left.occurredAt.getTime() - right.occurredAt.getTime() ||
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id),
      );

    // Clear first to avoid transient unique-key collisions while rebuilding
    // the linked list in chronological order.
    await tx.terraqoWorklogEntry.updateMany({
      where: { id: { in: ordered.map((entry) => entry.id) } },
      data: { previousWorklogId: null },
    });
    for (let index = 1; index < ordered.length; index += 1) {
      await tx.terraqoWorklogEntry.update({
        where: { id: ordered[index].id },
        data: { previousWorklogId: ordered[index - 1].id },
      });
    }

    return tx.terraqoWorklogEntry.findUniqueOrThrow({
      where: { id: current.id },
      include: worklogInclude,
    });
  }, { isolationLevel: "Serializable" });
}
