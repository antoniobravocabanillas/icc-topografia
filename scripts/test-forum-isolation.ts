import { PrismaClient } from "@prisma/client";
import { createForumPost, createForumReply, getForumChannelForUser, TerraqoForumError } from "../lib/terraqo/forums";

const prisma = new PrismaClient();

async function main() {
  const [professional, workspace] = await Promise.all([
    prisma.user.findUnique({ where: { email: "demo.profesional@terraqo.com" }, select: { id: true } }),
    prisma.terraqoWorkspace.findFirst({
      where: { slug: "icc-topografia", modules: { some: { code: "FORUMS", active: true } } },
      select: { id: true }
    })
  ]);
  if (!professional || !workspace) throw new Error("Falta el profesional demo o el modulo FORUMS no esta activo.");

  const outsider = await prisma.user.create({
    data: {
      email: `forum-outsider-${Date.now()}@example.test`,
      role: "CUSTOMER",
      terraqoProfessionalProfile: { create: { visibility: "PRIVATE" } }
    },
    select: { id: true }
  });
  const channel = await prisma.terraqoForumChannel.create({
    data: {
      workspaceId: workspace.id,
      name: "Canal privado de prueba",
      slug: `isolation-${Date.now()}`,
      visibility: "WORKSPACE"
    },
    select: { id: true }
  });

  try {
    await getForumChannelForUser(professional.id, channel.id);

    let denied = false;
    try {
      await getForumChannelForUser(outsider.id, channel.id);
    } catch (error) {
      denied = error instanceof TerraqoForumError && (error.status === 403 || error.status === 404);
    }
    if (!denied) throw new Error("Un profesional ajeno pudo abrir un canal del workspace.");

    const post = await createForumPost({
      userId: professional.id,
      payload: {
        channelId: channel.id,
        title: "Validacion del aislamiento del foro",
        body: "Este tema verifica que las conversaciones internas permanezcan dentro del workspace autorizado.",
        tags: ["seguridad", "workspace"]
      }
    });
    await createForumReply({ userId: professional.id, payload: { postId: post.id, body: "La respuesta tambien conserva el alcance del canal." } });

    const stored = await prisma.terraqoForumPost.findUnique({ where: { id: post.id }, include: { replies: true } });
    if (stored?.visibility !== "WORKSPACE" || stored.replies.length !== 1) {
      throw new Error("El tema o su respuesta no conservaron la visibilidad esperada.");
    }

    console.log("Forum isolation: OK");
  } finally {
    await prisma.terraqoForumChannel.delete({ where: { id: channel.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: outsider.id } }).catch(() => undefined);
  }
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
