import { PrismaClient } from "@prisma/client";
import { createOrGetMeeting, getMeetingForUser, TerraqoMeetError } from "../lib/terraqo/meet";

const prisma = new PrismaClient();

async function main() {
  const [professional, colleague, workspace] = await Promise.all([
    prisma.user.findUnique({ where: { email: "demo.profesional@terraqo.com" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "demo.colega@terraqo.com" }, select: { id: true } }),
    prisma.terraqoWorkspace.findFirst({
      where: { slug: "icc-topografia", modules: { some: { code: "TERRAQO_MEET", active: true } } },
      select: { id: true }
    })
  ]);
  if (!professional || !colleague || !workspace) throw new Error("Faltan accesos demo o el modulo Terraqo Meet no esta activo.");

  const outsider = await prisma.user.create({ data: { email: `meeting-outsider-${Date.now()}@example.test`, role: "CUSTOMER" } });
  const conversation = await prisma.terraqoConversation.create({
    data: {
      type: "DIRECT",
      workspaceId: workspace.id,
      createdById: professional.id,
      participants: {
        create: [
          { userId: professional.id, role: "OWNER" },
          { userId: colleague.id, role: "MEMBER" }
        ]
      }
    },
    select: { id: true }
  });

  try {
    const meeting = await createOrGetMeeting(professional.id, conversation.id);
    await getMeetingForUser(meeting.id, colleague.id);

    let denied = false;
    try {
      await getMeetingForUser(meeting.id, outsider.id);
    } catch (error) {
      denied = error instanceof TerraqoMeetError && error.status === 403;
    }
    if (!denied) throw new Error("Un usuario ajeno pudo abrir la reunion privada.");

    const stored = await prisma.terraqoMeeting.findUnique({ where: { id: meeting.id }, select: { workspaceId: true, participants: true } });
    if (stored?.workspaceId !== workspace.id || stored.participants.length !== 2) {
      throw new Error("La reunion no quedo aislada en el workspace y sus participantes autorizados.");
    }

    console.log("Meeting isolation: OK");
  } finally {
    await prisma.terraqoConversation.delete({ where: { id: conversation.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: outsider.id } }).catch(() => undefined);
  }
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
