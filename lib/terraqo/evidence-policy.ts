import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type EvidenceAudience = "OWNER" | "MEMBER" | "PUBLIC";

export type EvidenceReadScope = {
  audience: EvidenceAudience;
  profile: {
    id: string;
    userId: string;
    username: string | null;
    liveCvEnabled: boolean;
  };
  where: Prisma.TerraqoWorklogEntryWhereInput;
  workspaceIds: string[];
  capabilities: {
    view: true;
    edit: boolean;
    viewPreciseLocation: boolean;
    manageVisibility: boolean;
  };
};

export function buildEvidenceReadWhere(input: {
  audience: EvidenceAudience;
  professionalProfileId: string;
  liveCvEnabled: boolean;
  workspaceIds?: string[];
}): Prisma.TerraqoWorklogEntryWhereInput {
  const base = {
    professionalProfileId: input.professionalProfileId,
    deletedAt: null,
  };
  if (input.audience === "OWNER") return base;
  if (input.audience === "PUBLIC") {
    return {
      ...base,
      visibility: "PUBLIC",
    };
  }
  const workspaceIds = input.workspaceIds || [];
  return {
    ...base,
    OR: [
      ...(input.liveCvEnabled
        ? [{ visibility: "PUBLIC" as const }]
        : []),
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
  };
}

export async function resolveEvidenceReadScope(input: {
  actorUserId?: string | null;
  professionalProfileId: string;
}): Promise<EvidenceReadScope | null> {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { id: input.professionalProfileId },
    select: {
      id: true,
      userId: true,
      username: true,
      liveCvEnabled: true,
    },
  });
  if (!profile) return null;

  if (input.actorUserId === profile.userId) {
    return {
      audience: "OWNER",
      profile,
      where: buildEvidenceReadWhere({
        audience: "OWNER",
        professionalProfileId: profile.id,
        liveCvEnabled: profile.liveCvEnabled,
      }),
      workspaceIds: [],
      capabilities: {
        view: true,
        edit: true,
        viewPreciseLocation: true,
        manageVisibility: true,
      },
    };
  }

  if (!input.actorUserId) {
    if (!profile.liveCvEnabled) return null;
    return {
      audience: "PUBLIC",
      profile,
      where: buildEvidenceReadWhere({
        audience: "PUBLIC",
        professionalProfileId: profile.id,
        liveCvEnabled: profile.liveCvEnabled,
      }),
      workspaceIds: [],
      capabilities: {
        view: true,
        edit: false,
        viewPreciseLocation: false,
        manageVisibility: false,
      },
    };
  }

  const memberships = await prisma.terraqoWorkspaceMember.findMany({
    where: {
      userId: input.actorUserId,
      active: true,
      workspace: { active: true, deletedAt: null },
    },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  return {
    audience: "MEMBER",
    profile,
    where: buildEvidenceReadWhere({
      audience: "MEMBER",
      professionalProfileId: profile.id,
      liveCvEnabled: profile.liveCvEnabled,
      workspaceIds,
    }),
    workspaceIds,
    capabilities: {
      view: true,
      edit: false,
      viewPreciseLocation: false,
      manageVisibility: false,
    },
  };
}

export function scopeEvidenceWhere(
  scope: EvidenceReadScope,
  extra?: Prisma.TerraqoWorklogEntryWhereInput,
): Prisma.TerraqoWorklogEntryWhereInput {
  return extra ? { AND: [scope.where, extra] } : scope.where;
}
