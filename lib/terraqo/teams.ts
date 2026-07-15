import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { terraqoTeamCreateSchema, terraqoTeamInvitationSchema } from "@/lib/validations/terraqo";

export class TerraqoTeamError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "TerraqoTeamError";
  }
}

const teamInclude = {
  workspace: { select: { id: true, name: true, slug: true } },
  owner: { select: { id: true, name: true, email: true, image: true } },
  project: { select: { id: true, title: true } },
  conversation: { select: { id: true } },
  members: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          terraqoProfessionalProfile: { select: { id: true, headline: true, city: true, status: true } }
        }
      }
    },
    orderBy: [{ status: "asc" as const }, { joinedAt: "asc" as const }, { invitedAt: "asc" as const }]
  }
} satisfies Prisma.TerraqoTeamInclude;

export async function getTeamWorkspaces(userId: string) {
  return prisma.terraqoWorkspace.findMany({
    where: {
      active: true,
      deletedAt: null,
      members: { some: { userId, active: true } },
      AND: [
        { modules: { some: { code: "COLLABORATION_TEAMS", active: true } } },
        { modules: { some: { code: "PROFESSIONAL_MESSAGING", active: true } } }
      ]
    },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" }
  });
}

export async function getTeamHub(userId: string) {
  const workspaces = await getTeamWorkspaces(userId);
  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const [teams, colleagueMemberships, projects] = await Promise.all([
    prisma.terraqoTeam.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        status: "ACTIVE",
        members: { some: { userId, status: { in: ["INVITED", "ACTIVE"] } } }
      },
      include: teamInclude,
      orderBy: { updatedAt: "desc" }
    }),
    prisma.terraqoWorkspaceMember.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        active: true,
        userId: { not: userId },
        user: { terraqoProfessionalProfile: { isNot: null } }
      },
      select: {
        workspaceId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            terraqoProfessionalProfile: { select: { headline: true, status: true } }
          }
        }
      },
      orderBy: { user: { name: "asc" } }
    }),
    prisma.project.findMany({
      where: { terraqoWorkspaceId: { in: workspaceIds }, deletedAt: null },
      select: { id: true, title: true, terraqoWorkspaceId: true },
      orderBy: { updatedAt: "desc" },
      take: 80
    })
  ]);

  const colleagues = Array.from(new Map(colleagueMemberships.map((membership) => [`${membership.workspaceId}:${membership.user.id}`, {
    workspaceId: membership.workspaceId,
    userId: membership.user.id,
    name: membership.user.name || membership.user.email,
    email: membership.user.email,
    headline: membership.user.terraqoProfessionalProfile?.headline || "Profesional Terraqo",
    status: membership.user.terraqoProfessionalProfile?.status || "OPEN_TO_PROJECTS"
  }])).values());

  return { workspaces, teams, colleagues, projects };
}

export async function getTeamForUser(userId: string, teamId: string) {
  const team = await prisma.terraqoTeam.findFirst({
    where: {
      id: teamId,
      status: "ACTIVE",
      workspace: {
        active: true,
        deletedAt: null,
        modules: { some: { code: "COLLABORATION_TEAMS", active: true } }
      },
      members: { some: { userId, status: { in: ["INVITED", "ACTIVE"] } } }
    },
    include: teamInclude
  });
  if (!team) throw new TerraqoTeamError("Este equipo no existe o no esta disponible para tu perfil.", 404);
  return team;
}

export async function createTeam(input: { userId: string; payload: z.infer<typeof terraqoTeamCreateSchema> }) {
  const memberUserIds = Array.from(new Set(input.payload.memberUserIds)).filter((id) => id !== input.userId);
  if (!memberUserIds.length) throw new TerraqoTeamError("Invita al menos a otro profesional.");

  const [workspace, eligibleMembers, project] = await Promise.all([
    prisma.terraqoWorkspace.findFirst({
      where: {
        id: input.payload.workspaceId,
        active: true,
        deletedAt: null,
        members: { some: { userId: input.userId, active: true } },
        AND: [
          { modules: { some: { code: "COLLABORATION_TEAMS", active: true } } },
          { modules: { some: { code: "PROFESSIONAL_MESSAGING", active: true } } }
        ]
      },
      select: { id: true }
    }),
    prisma.terraqoWorkspaceMember.findMany({
      where: {
        workspaceId: input.payload.workspaceId,
        userId: { in: memberUserIds },
        active: true,
        user: { terraqoProfessionalProfile: { isNot: null } }
      },
      select: { userId: true }
    }),
    input.payload.projectId
      ? prisma.project.findFirst({
          where: { id: input.payload.projectId, terraqoWorkspaceId: input.payload.workspaceId, deletedAt: null },
          select: { id: true }
        })
      : Promise.resolve(null)
  ]);

  if (!workspace) throw new TerraqoTeamError("Tu perfil no puede crear equipos en este workspace.", 403);
  if (eligibleMembers.length !== memberUserIds.length) throw new TerraqoTeamError("Uno de los profesionales no pertenece a este workspace.", 403);
  if (input.payload.projectId && !project) throw new TerraqoTeamError("El proyecto seleccionado no pertenece al workspace.", 403);

  return prisma.$transaction(async (tx) => {
    const conversation = await tx.terraqoConversation.create({
      data: {
        type: "GROUP",
        title: input.payload.name,
        workspaceId: workspace.id,
        projectId: project?.id,
        createdById: input.userId,
        participants: { create: { userId: input.userId, role: "OWNER", lastReadAt: new Date() } }
      },
      select: { id: true }
    });
    return tx.terraqoTeam.create({
      data: {
        workspaceId: workspace.id,
        ownerUserId: input.userId,
        name: input.payload.name,
        purpose: input.payload.purpose,
        projectId: project?.id,
        conversationId: conversation.id,
        members: {
          create: [
            { userId: input.userId, invitedByUserId: input.userId, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
            ...memberUserIds.map((userId) => ({ userId, invitedByUserId: input.userId, role: "MEMBER" as const, status: "INVITED" as const }))
          ]
        }
      },
      select: { id: true }
    });
  });
}

export async function respondToTeamInvitation(input: { userId: string; payload: z.infer<typeof terraqoTeamInvitationSchema> }) {
  const membership = await prisma.terraqoTeamMember.findFirst({
    where: {
      teamId: input.payload.teamId,
      userId: input.userId,
      status: "INVITED",
      team: {
        status: "ACTIVE",
        workspace: { active: true, deletedAt: null, modules: { some: { code: "COLLABORATION_TEAMS", active: true } } }
      }
    },
    select: { id: true, team: { select: { conversationId: true } } }
  });
  if (!membership) throw new TerraqoTeamError("Esta invitacion ya no esta disponible.", 404);

  if (input.payload.action === "decline") {
    await prisma.terraqoTeamMember.update({ where: { id: membership.id }, data: { status: "DECLINED" } });
    return { teamId: input.payload.teamId, status: "DECLINED" as const };
  }

  await prisma.$transaction(async (tx) => {
    await tx.terraqoTeamMember.update({ where: { id: membership.id }, data: { status: "ACTIVE", joinedAt: new Date() } });
    if (membership.team.conversationId) {
      await tx.terraqoConversationParticipant.upsert({
        where: { conversationId_userId: { conversationId: membership.team.conversationId, userId: input.userId } },
        create: { conversationId: membership.team.conversationId, userId: input.userId, role: "MEMBER", lastReadAt: new Date() },
        update: { leftAt: null, lastReadAt: new Date() }
      });
    }
  });
  return { teamId: input.payload.teamId, status: "ACTIVE" as const };
}

export type TeamHubData = Awaited<ReturnType<typeof getTeamHub>>;
export type TeamDetailData = Awaited<ReturnType<typeof getTeamForUser>>;
