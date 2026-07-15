import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export class TerraqoMeetError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const allowedReturnPaths = new Set(["/portal/mensajes", "/admin/terraqo/mensajes"]);

export function safeMeetReturnPath(path?: string | null) {
  return path && allowedReturnPaths.has(path) ? path : "/portal/mensajes";
}

const meetingInclude = {
  workspace: { select: { id: true, name: true, slug: true } },
  project: { select: { id: true, title: true } },
  conversation: {
    select: {
      id: true,
      type: true,
      title: true,
      participants: {
        where: { leftAt: null },
        select: { userId: true, role: true, user: { select: { id: true, name: true, email: true, image: true } } }
      }
    }
  },
  participants: {
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: "asc" as const }
  }
};

function createRoomKey() {
  return `Terraqo-${randomBytes(24).toString("hex")}`;
}

export function getMeetProviderConfig() {
  const configuredDomain = process.env.TERRAQO_MEET_DOMAIN?.trim()
    || process.env.NEXT_PUBLIC_TERRAQO_MEET_DOMAIN?.trim()
    || "meet.jit.si";
  const domain = /^[a-z0-9.-]+(?::\d+)?$/i.test(configuredDomain) ? configuredDomain : "meet.jit.si";
  return {
    domain,
    scriptUrl: `https://${domain}/external_api.js`,
    provider: domain === "meet.jit.si" ? "JITSI" as const : "CUSTOM_JITSI" as const
  };
}

export async function createOrGetMeeting(userId: string, conversationId: string) {
  const participant = await prisma.terraqoConversationParticipant.findFirst({
    where: { conversationId, userId, leftAt: null },
    select: {
      role: true,
      conversation: {
        select: {
          id: true,
          title: true,
          workspaceId: true,
          projectId: true,
          project: { select: { title: true } },
          participants: { where: { leftAt: null }, select: { userId: true } },
          workspace: {
            select: {
              name: true,
              modules: { where: { code: "TERRAQO_MEET", active: true }, select: { id: true } }
            }
          }
        }
      }
    }
  });

  if (!participant?.conversation.workspaceId || !participant.conversation.workspace?.modules.length) {
    throw new TerraqoMeetError("No tienes acceso a Terraqo Meet en esta conversacion.", 403);
  }

  const current = await prisma.terraqoMeeting.findFirst({
    where: { conversationId, status: "LIVE" },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });
  if (current) {
    await prisma.terraqoMeetingParticipant.upsert({
      where: { meetingId_userId: { meetingId: current.id, userId } },
      update: {},
      create: { meetingId: current.id, userId }
    });
    return current;
  }

  const title = participant.conversation.title
    || participant.conversation.project?.title
    || `Reunion ${participant.conversation.workspace.name}`;

  return prisma.terraqoMeeting.create({
    data: {
      roomKey: createRoomKey(),
      title,
      provider: getMeetProviderConfig().provider,
      workspaceId: participant.conversation.workspaceId,
      conversationId,
      projectId: participant.conversation.projectId,
      createdById: userId,
      participants: {
        create: participant.conversation.participants.map(({ userId: participantUserId }) => ({
          userId: participantUserId,
          joinedAt: participantUserId === userId ? new Date() : undefined
        }))
      }
    },
    select: { id: true }
  });
}

export async function getMeetingForUser(meetingId: string, userId: string) {
  const participant = await prisma.terraqoMeetingParticipant.findFirst({
    where: {
      meetingId,
      userId,
      meeting: {
        status: "LIVE",
        workspace: { modules: { some: { code: "TERRAQO_MEET", active: true } } },
        conversation: { participants: { some: { userId, leftAt: null } } }
      }
    },
    select: { meeting: { include: meetingInclude } }
  });
  if (!participant) throw new TerraqoMeetError("La reunion no existe, termino o no esta autorizada para tu perfil.", 403);
  return participant.meeting;
}

export async function updateMeetingPresence(meetingId: string, userId: string, joined: boolean) {
  await getMeetingForUser(meetingId, userId);
  return prisma.terraqoMeetingParticipant.update({
    where: { meetingId_userId: { meetingId, userId } },
    data: joined ? { joinedAt: new Date(), leftAt: null } : { leftAt: new Date() }
  });
}

export async function endMeeting(meetingId: string, userId: string) {
  const meeting = await getMeetingForUser(meetingId, userId);
  const participant = meeting.conversation.participants.find((item) => item.userId === userId);
  if (meeting.createdById !== userId && participant?.role !== "OWNER" && participant?.role !== "MODERATOR") {
    throw new TerraqoMeetError("Solo quien inicio la reunion o modera la conversacion puede finalizarla.", 403);
  }
  return prisma.terraqoMeeting.update({
    where: { id: meetingId },
    data: { status: "ENDED", endedAt: new Date() }
  });
}

export type TerraqoMeetingData = Awaited<ReturnType<typeof getMeetingForUser>>;
