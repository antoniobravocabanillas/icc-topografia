import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { terraqoWorklogCreateSchema } from "@/lib/validations/terraqo";

export const worklogInclude = {
  author: { select: { id: true, name: true, image: true } },
  professionalProfile: {
    select: {
      id: true,
      headline: true,
      city: true,
      status: true,
      identityVerificationStatus: true
    }
  },
  workspace: { select: { id: true, slug: true, name: true, brandName: true, logoUrl: true } },
  project: { select: { id: true, slug: true, title: true } },
  comments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { author: { select: { id: true, name: true, image: true } } }
  },
  reactions: { select: { id: true, userId: true, type: true } },
  _count: { select: { comments: true, reactions: true } }
} satisfies Prisma.TerraqoWorklogEntryInclude;

export type WorklogWithContext = Prisma.TerraqoWorklogEntryGetPayload<{
  include: typeof worklogInclude;
}>;

export class TerraqoWorklogError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "TerraqoWorklogError";
  }
}

export async function getProfessionalNetworkContext(userId: string) {
  const [profile, memberships] = await Promise.all([
    prisma.terraqoProfessionalProfile.findUnique({
      where: { userId },
      select: { id: true, visibility: true, liveCvEnabled: true }
    }),
    prisma.terraqoWorkspaceMember.findMany({
      where: { userId, active: true, workspace: { active: true, deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: {
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
            modules: { where: { active: true }, select: { code: true } }
          }
        }
      }
    })
  ]);

  return { profile, memberships };
}

export function visibleWorklogWhere(userId: string, workspaceIds: string[]): Prisma.TerraqoWorklogEntryWhereInput {
  return {
    deletedAt: null,
    OR: [
      { authorId: userId },
      { visibility: "PUBLIC" },
      { visibility: "COMMUNITY" },
      ...(workspaceIds.length ? [{ visibility: "WORKSPACE" as const, workspaceId: { in: workspaceIds } }] : [])
    ],
    AND: [
      {
        OR: [
          { workspaceId: null },
          { workspace: { modules: { some: { code: "PROFESSIONAL_NETWORK", active: true } } } }
        ]
      }
    ]
  };
}

export async function getVisibleWorklogs(userId: string, take = 30) {
  const context = await getProfessionalNetworkContext(userId);
  if (!context.profile) return { ...context, worklogs: [] as WorklogWithContext[] };

  const workspaceIds = context.memberships.map((membership) => membership.workspaceId);
  const worklogs = await prisma.terraqoWorklogEntry.findMany({
    where: visibleWorklogWhere(userId, workspaceIds),
    include: worklogInclude,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take
  });

  return { ...context, worklogs };
}

export async function canViewWorklog(userId: string, worklogId: string) {
  const memberships = await prisma.terraqoWorkspaceMember.findMany({
    where: { userId, active: true },
    select: { workspaceId: true }
  });
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  return prisma.terraqoWorklogEntry.findFirst({
    where: { id: worklogId, ...visibleWorklogWhere(userId, workspaceIds) },
    select: { id: true, authorId: true, workspaceId: true }
  });
}

export async function createProfessionalWorklog(input: {
  userId: string;
  payload: z.infer<typeof terraqoWorklogCreateSchema>;
  requiredWorkspaceId?: string;
}) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: input.userId },
    select: { id: true }
  });
  if (!profile) throw new TerraqoWorklogError("Completa tu perfil profesional antes de publicar una bitacora.", 409);

  const workspaceId = input.requiredWorkspaceId || input.payload.workspaceId;
  if (input.requiredWorkspaceId && input.payload.workspaceId && input.payload.workspaceId !== input.requiredWorkspaceId) {
    throw new TerraqoWorklogError("El workspace de la publicacion no coincide con tu sesion.", 403);
  }

  if (workspaceId) {
    const membership = await prisma.terraqoWorkspaceMember.findFirst({
      where: { workspaceId, userId: input.userId, active: true },
      select: { id: true }
    });
    if (!membership) throw new TerraqoWorklogError("No perteneces al workspace seleccionado.", 403);
    await requireWorkspaceModule("PROFESSIONAL_NETWORK", workspaceId);
    await requireWorkspaceModule("LIVE_CV", workspaceId);
  }

  if (input.payload.projectId) {
    if (!workspaceId) throw new TerraqoWorklogError("El proyecto requiere un workspace.", 422);
    const project = await prisma.project.findFirst({
      where: {
        id: input.payload.projectId,
        terraqoWorkspaceId: workspaceId,
        deletedAt: null,
        OR: [
          { terraqoExperiences: { some: { professionalProfileId: profile.id } } },
          { terraqoJobPosts: { some: { applications: { some: { professionalProfileId: profile.id, status: "ACCEPTED" } } } } }
        ]
      },
      select: { id: true }
    });
    if (!project) throw new TerraqoWorklogError("El proyecto no esta asignado a tu perfil profesional.", 403);
  }

  return prisma.terraqoWorklogEntry.create({
    data: {
      professionalProfileId: profile.id,
      authorId: input.userId,
      workspaceId,
      projectId: input.payload.projectId,
      title: input.payload.title,
      summary: input.payload.summary,
      outcome: input.payload.outcome,
      type: input.payload.type,
      visibility: input.payload.visibility,
      skills: input.payload.skills,
      evidenceUrls: input.payload.evidenceUrls,
      occurredAt: input.payload.occurredAt,
      evidenceStatus: input.payload.projectId ? "LINKED" : "DECLARED"
    },
    include: worklogInclude
  });
}
