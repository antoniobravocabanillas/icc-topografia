import { PrismaClient } from "@prisma/client";
import { createTeam, getTeamForUser, respondToTeamInvitation, TerraqoTeamError } from "../lib/terraqo/teams";

const prisma = new PrismaClient();

async function main() {
  const [professional, colleague, workspace] = await Promise.all([
    prisma.user.findUnique({ where: { email: "demo.profesional@terraqo.com" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "demo.colega@terraqo.com" }, select: { id: true } }),
    prisma.terraqoWorkspace.findFirst({
      where: {
        slug: "icc-topografia",
        AND: [
          { modules: { some: { code: "COLLABORATION_TEAMS", active: true } } },
          { modules: { some: { code: "PROFESSIONAL_MESSAGING", active: true } } }
        ]
      },
      select: { id: true }
    })
  ]);
  if (!professional || !colleague || !workspace) throw new Error("Faltan accesos demo o el modulo Equipos Terraqo no esta activo.");

  const outsider = await prisma.user.create({
    data: {
      email: `team-outsider-${Date.now()}@example.test`,
      role: "CUSTOMER",
      terraqoProfessionalProfile: { create: { visibility: "PRIVATE" } }
    },
    select: { id: true }
  });
  let teamId = "";
  let conversationId = "";

  try {
    const team = await createTeam({
      userId: professional.id,
      payload: {
        workspaceId: workspace.id,
        name: "Equipo de aislamiento",
        purpose: "Validar que las invitaciones y la sala permanezcan dentro del workspace autorizado.",
        memberUserIds: [colleague.id]
      }
    });
    teamId = team.id;

    let denied = false;
    try {
      await getTeamForUser(outsider.id, team.id);
    } catch (error) {
      denied = error instanceof TerraqoTeamError && error.status === 404;
    }
    if (!denied) throw new Error("Un profesional ajeno pudo abrir el equipo privado.");

    await respondToTeamInvitation({ userId: colleague.id, payload: { teamId: team.id, action: "accept" } });
    const stored = await prisma.terraqoTeam.findUnique({
      where: { id: team.id },
      include: { members: true, conversation: { include: { participants: true } } }
    });
    conversationId = stored?.conversationId || "";
    const accepted = stored?.members.find((member) => member.userId === colleague.id);
    const participant = stored?.conversation?.participants.find((member) => member.userId === colleague.id && !member.leftAt);
    if (accepted?.status !== "ACTIVE" || !participant || stored?.workspaceId !== workspace.id) {
      throw new Error("La aceptacion no activo correctamente al integrante en su sala privada.");
    }

    console.log("Team isolation: OK");
  } finally {
    if (teamId) await prisma.terraqoTeam.delete({ where: { id: teamId } }).catch(() => undefined);
    if (conversationId) await prisma.terraqoConversation.delete({ where: { id: conversationId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: outsider.id } }).catch(() => undefined);
  }
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
