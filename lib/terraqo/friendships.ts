import { prisma } from "@/lib/prisma";

export class TerraqoFriendshipError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function friendshipPairKey(left: string, right: string) {
  return [left, right].sort().join(":");
}

export async function requestFriendship(
  requesterId: string,
  recipientId: string,
) {
  if (!recipientId || requesterId === recipientId)
    throw new TerraqoFriendshipError("Selecciona otro profesional.");
  const recipient = await prisma.user.findFirst({
    where: {
      id: recipientId,
      terraqoProfessionalProfile: { friendDiscoveryEnabled: true },
    },
    select: { id: true },
  });
  if (!recipient)
    throw new TerraqoFriendshipError(
      "Este profesional no acepta solicitudes de amistad.",
      403,
    );
  const pairKey = friendshipPairKey(requesterId, recipientId);
  const existing = await prisma.terraqoFriendship.findUnique({
    where: { pairKey },
  });
  if (existing?.status === "BLOCKED")
    throw new TerraqoFriendshipError("No puedes enviar esta solicitud.", 403);
  if (existing?.status === "ACCEPTED") return existing;
  return prisma.terraqoFriendship.upsert({
    where: { pairKey },
    update: { requesterId, recipientId, status: "PENDING", respondedAt: null },
    create: { pairKey, requesterId, recipientId },
  });
}

export async function updateFriendship(
  userId: string,
  friendshipId: string,
  action: string,
) {
  const friendship = await prisma.terraqoFriendship.findUnique({
    where: { id: friendshipId },
  });
  if (
    !friendship ||
    ![friendship.requesterId, friendship.recipientId].includes(userId)
  )
    throw new TerraqoFriendshipError("Solicitud no encontrada.", 404);
  if (action === "accept") {
    if (friendship.recipientId !== userId || friendship.status !== "PENDING")
      throw new TerraqoFriendshipError(
        "No puedes aceptar esta solicitud.",
        403,
      );
    return prisma.terraqoFriendship.update({
      where: { id: friendship.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
  }
  if (action === "decline") {
    if (friendship.recipientId !== userId || friendship.status !== "PENDING")
      throw new TerraqoFriendshipError(
        "No puedes rechazar esta solicitud.",
        403,
      );
    return prisma.terraqoFriendship.update({
      where: { id: friendship.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
  }
  if (action === "cancel" && friendship.requesterId !== userId)
    throw new TerraqoFriendshipError("No puedes cancelar esta solicitud.", 403);
  if (["cancel", "remove"].includes(action))
    return prisma.terraqoFriendship.delete({ where: { id: friendship.id } });
  throw new TerraqoFriendshipError("Accion no valida.");
}

export async function friendshipList(userId: string) {
  return prisma.terraqoFriendship.findMany({
    where: { OR: [{ requesterId: userId }, { recipientId: userId }] },
    include: {
      requester: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          terraqoProfessionalProfile: { select: { id: true, headline: true } },
        },
      },
      recipient: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          terraqoProfessionalProfile: { select: { id: true, headline: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function areFriends(left: string, right: string) {
  return Boolean(
    await prisma.terraqoFriendship.findFirst({
      where: { pairKey: friendshipPairKey(left, right), status: "ACCEPTED" },
      select: { id: true },
    }),
  );
}
