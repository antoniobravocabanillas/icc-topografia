import { prisma } from "@/lib/prisma";

export class TerraqoMessagingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const conversationInclude = {
  participants: {
    where: { leftAt: null },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          terraqoProfessionalProfile: { select: { id: true, headline: true } }
        }
      }
    }
  },
  messages: {
    where: { deletedAt: null },
    include: { sender: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: "asc" as const },
    take: 120
  },
  meetings: {
    where: { status: "LIVE" as const },
    select: { id: true, createdById: true, startedAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 1
  },
  project: { select: { id: true, title: true } },
  workspace: { select: { id: true, name: true, slug: true } }
};

export async function getMessagingWorkspaces(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return prisma.terraqoWorkspace.findMany({
    where: {
      active: true,
      modules: { some: { code: "PROFESSIONAL_MESSAGING", active: true } },
      ...(user?.role === "SUPER_ADMIN" ? {} : { members: { some: { userId, active: true } } })
    },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" }
  });
}

export async function getConversationHub(userId: string, selectedId?: string, workspaceId?: string) {
  const workspaces = await getMessagingWorkspaces(userId);
  const allowedWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  if (workspaceId && !allowedWorkspaceIds.has(workspaceId)) throw new TerraqoMessagingError("El modulo de mensajeria no esta activo para este workspace.", 403);

  const participantWhere = { participants: { some: { userId, leftAt: null } } };
  const [conversations, recipientMembers, meetModules] = await Promise.all([
    prisma.terraqoConversation.findMany({
      where: {
        ...participantWhere,
        archivedAt: null,
        workspaceId: workspaceId || { in: [...allowedWorkspaceIds] }
      },
      include: conversationInclude,
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }]
    }),
    prisma.terraqoWorkspaceMember.findMany({
      where: {
        active: true,
        workspaceId: workspaceId || { in: [...allowedWorkspaceIds] },
        userId: { not: userId }
      },
      include: {
        workspace: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            terraqoProfessionalProfile: { select: { id: true, headline: true, status: true } }
          }
        }
      },
      orderBy: { user: { name: "asc" } }
    }),
    prisma.terraqoWorkspaceModule.findMany({
      where: { workspaceId: { in: [...allowedWorkspaceIds] }, code: "TERRAQO_MEET", active: true },
      select: { workspaceId: true }
    })
  ]);

  const recipients = Array.from(new Map(recipientMembers.map((member) => [member.userId, {
    userId: member.userId,
    name: member.user.name || member.user.email,
    email: member.user.email,
    headline: member.user.terraqoProfessionalProfile?.headline || member.title || member.role,
    workspaceId: member.workspaceId,
    workspaceName: member.workspace.name,
    professional: Boolean(member.user.terraqoProfessionalProfile)
  }])).values());

  const selected = conversations.find((conversation) => conversation.id === selectedId) || conversations[0] || null;
  if (selected) {
    await prisma.terraqoConversationParticipant.updateMany({
      where: { conversationId: selected.id, userId, leftAt: null },
      data: { lastReadAt: new Date() }
    });
  }

  return { conversations, selected, recipients, workspaces, meetWorkspaceIds: meetModules.map((module) => module.workspaceId) };
}

export async function startConversation(input: {
  actorUserId: string;
  recipientUserId: string;
  workspaceId?: string;
  projectId?: string;
}) {
  if (input.actorUserId === input.recipientUserId) throw new TerraqoMessagingError("Selecciona otro participante.");

  const [actor, recipient, workspaces] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.actorUserId }, select: { id: true, terraqoProfessionalProfile: { select: { id: true } } } }),
    prisma.user.findUnique({ where: { id: input.recipientUserId }, select: { id: true, terraqoProfessionalProfile: { select: { id: true } } } }),
    getMessagingWorkspaces(input.actorUserId)
  ]);
  if (!actor || !recipient) throw new TerraqoMessagingError("No encontramos uno de los participantes.", 404);

  const allowedIds = new Set(workspaces.map((workspace) => workspace.id));
  let workspaceId = input.workspaceId;
  if (!workspaceId) {
    const shared = await prisma.terraqoWorkspaceMember.findFirst({
      where: {
        userId: input.recipientUserId,
        active: true,
        workspaceId: { in: [...allowedIds] }
      },
      select: { workspaceId: true }
    });
    workspaceId = shared?.workspaceId;
  }
  if (!workspaceId || !allowedIds.has(workspaceId)) throw new TerraqoMessagingError("No comparten un espacio con mensajeria habilitada.", 403);

  const recipientMembership = await prisma.terraqoWorkspaceMember.findFirst({
    where: { workspaceId, userId: input.recipientUserId, active: true },
    select: { id: true }
  });
  if (!recipientMembership) throw new TerraqoMessagingError("El destinatario no pertenece a este workspace.", 403);

  if (input.projectId) {
    const project = await prisma.project.findFirst({ where: { id: input.projectId, terraqoWorkspaceId: workspaceId, deletedAt: null }, select: { id: true } });
    if (!project) throw new TerraqoMessagingError("El proyecto no pertenece al workspace.", 403);
  }

  const pair = [input.actorUserId, input.recipientUserId].sort().join(":");
  const directKey = `${workspaceId}:${input.projectId || "direct"}:${pair}`;
  const type = input.projectId ? "PROJECT" : actor.terraqoProfessionalProfile && recipient.terraqoProfessionalProfile ? "DIRECT" : "COMPANY";

  return prisma.terraqoConversation.upsert({
    where: { directKey },
    update: { archivedAt: null },
    create: {
      type,
      directKey,
      workspaceId,
      projectId: input.projectId,
      createdById: input.actorUserId,
      participants: {
        create: [
          { userId: input.actorUserId, role: "OWNER", lastReadAt: new Date() },
          { userId: input.recipientUserId, role: "MEMBER" }
        ]
      }
    },
    select: { id: true }
  });
}

export async function sendMessage(input: { userId: string; conversationId: string; body: string }) {
  const body = input.body.trim();
  if (!body || body.length > 4000) throw new TerraqoMessagingError("El mensaje debe tener entre 1 y 4000 caracteres.");

  const participant = await prisma.terraqoConversationParticipant.findFirst({
    where: { conversationId: input.conversationId, userId: input.userId, leftAt: null },
    select: {
      id: true,
      conversation: {
        select: {
          workspace: {
            select: {
              modules: {
                where: { code: "PROFESSIONAL_MESSAGING", active: true },
                select: { id: true }
              }
            }
          }
        }
      }
    }
  });
  if (!participant || !participant.conversation.workspace?.modules.length) {
    throw new TerraqoMessagingError("No tienes acceso a esta conversacion o el modulo no esta activo.", 403);
  }

  return prisma.$transaction(async (tx) => {
    const message = await tx.terraqoDirectMessage.create({
      data: { conversationId: input.conversationId, senderId: input.userId, body }
    });
    await tx.terraqoConversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: message.createdAt }
    });
    await tx.terraqoConversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: message.createdAt }
    });
    return message;
  });
}

export type ConversationHubData = Awaited<ReturnType<typeof getConversationHub>>;
