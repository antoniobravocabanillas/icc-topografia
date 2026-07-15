import type { Prisma, TerraqoVisibility } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { terraqoForumPostCreateSchema, terraqoForumReplyCreateSchema } from "@/lib/validations/terraqo";

export class TerraqoForumError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "TerraqoForumError";
  }
}

const authorSelect = {
  id: true,
  name: true,
  image: true,
  terraqoProfessionalProfile: {
    select: { id: true, headline: true, city: true, identityVerificationStatus: true }
  }
} satisfies Prisma.UserSelect;

export async function getForumAccessContext(userId: string) {
  const [profile, memberships] = await Promise.all([
    prisma.terraqoProfessionalProfile.findUnique({
      where: { userId },
      select: { id: true }
    }),
    prisma.terraqoWorkspaceMember.findMany({
      where: {
        userId,
        active: true,
        workspace: {
          active: true,
          deletedAt: null,
          modules: { some: { code: "FORUMS", active: true } }
        }
      },
      select: { workspaceId: true, workspace: { select: { name: true, slug: true } } }
    })
  ]);

  if (!profile) throw new TerraqoForumError("Completa tu perfil profesional para participar en Commons.", 403);
  if (!memberships.length) throw new TerraqoForumError("Tu espacio no tiene Terraqo Commons habilitado.", 403);

  return { profile, memberships, workspaceIds: memberships.map((membership) => membership.workspaceId) };
}

function visibleChannelWhere(workspaceIds: string[]): Prisma.TerraqoForumChannelWhereInput {
  return {
    active: true,
    AND: [
      {
        OR: [
          { workspaceId: null },
          { workspace: { active: true, deletedAt: null, modules: { some: { code: "FORUMS", active: true } } } }
        ]
      },
      {
        OR: [
          { visibility: { in: ["PUBLIC", "COMMUNITY"] } },
          { visibility: { in: ["WORKSPACE", "PRIVATE"] }, workspaceId: { in: workspaceIds } }
        ]
      }
    ]
  };
}

export async function getVisibleForumChannels(userId: string) {
  const context = await getForumAccessContext(userId);
  const channels = await prisma.terraqoForumChannel.findMany({
    where: visibleChannelWhere(context.workspaceIds),
    include: {
      workspace: { select: { id: true, name: true, brandName: true, slug: true } },
      posts: {
        where: { deletedAt: null },
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        take: 1,
        select: { id: true, title: true, updatedAt: true }
      },
      _count: { select: { posts: { where: { deletedAt: null } } } }
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }]
  });
  return { ...context, channels };
}

export async function getForumChannelForUser(userId: string, channelId: string) {
  const context = await getForumAccessContext(userId);
  const channel = await prisma.terraqoForumChannel.findFirst({
    where: { id: channelId, ...visibleChannelWhere(context.workspaceIds) },
    include: {
      workspace: { select: { id: true, name: true, brandName: true, slug: true } },
      posts: {
        where: { deletedAt: null },
        include: {
          author: { select: authorSelect },
          _count: { select: { replies: { where: { deletedAt: null } } } }
        },
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        take: 80
      }
    }
  });
  if (!channel) throw new TerraqoForumError("Este canal no existe o no esta disponible para tu perfil.", 404);
  return { ...context, channel };
}

export async function getForumPostForUser(userId: string, channelId: string, postId: string) {
  const { channel, ...context } = await getForumChannelForUser(userId, channelId);
  const post = await prisma.terraqoForumPost.findFirst({
    where: { id: postId, channelId: channel.id, deletedAt: null },
    include: {
      author: { select: authorSelect },
      replies: {
        where: { deletedAt: null },
        include: { author: { select: authorSelect } },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!post) throw new TerraqoForumError("No encontramos esta conversacion.", 404);
  return { ...context, channel, post };
}

function normalizedTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.replace(/^#/, "").trim()).filter(Boolean)));
}

function postVisibility(channelVisibility: TerraqoVisibility) {
  return channelVisibility === "PRIVATE" ? "WORKSPACE" : channelVisibility;
}

export async function createForumPost(input: {
  userId: string;
  payload: z.infer<typeof terraqoForumPostCreateSchema>;
}) {
  const { channel } = await getForumChannelForUser(input.userId, input.payload.channelId);
  return prisma.terraqoForumPost.create({
    data: {
      channelId: channel.id,
      authorId: input.userId,
      title: input.payload.title,
      body: input.payload.body,
      tags: normalizedTags(input.payload.tags),
      visibility: postVisibility(channel.visibility)
    },
    select: { id: true, channelId: true }
  });
}

export async function createForumReply(input: {
  userId: string;
  payload: z.infer<typeof terraqoForumReplyCreateSchema>;
}) {
  const post = await prisma.terraqoForumPost.findFirst({
    where: { id: input.payload.postId, deletedAt: null },
    select: { id: true, channelId: true }
  });
  if (!post) throw new TerraqoForumError("No encontramos esta conversacion.", 404);
  await getForumPostForUser(input.userId, post.channelId, post.id);
  return prisma.terraqoForumReply.create({
    data: { postId: post.id, authorId: input.userId, body: input.payload.body },
    select: { id: true, postId: true }
  });
}
