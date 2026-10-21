import { confirmedLocalDisposableDatabaseUrl } from "./lib/confirmed-local-disposable-database";

async function main() {
  process.env.DATABASE_URL = confirmedLocalDisposableDatabaseUrl({
    value: process.env.ISOLATION_TEST_DATABASE_URL,
    expected: process.env.ISOLATION_TEST_EXPECTED_DATABASE,
    valueVariable: "ISOLATION_TEST_DATABASE_URL",
    expectedVariable: "ISOLATION_TEST_EXPECTED_DATABASE",
  });
  const [{ prisma }, { getConversationHub, startConversation, TerraqoMessagingError }] = await Promise.all([
    import("../lib/prisma"),
    import("../lib/terraqo/messaging"),
  ]);
  try {
  const [professional, colleague, companyAdmin, superAdmin] = await Promise.all([
    prisma.user.findUnique({ where: { email: "demo.profesional@terraqo.com" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "demo.colega@terraqo.com" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "demo.empresa@icctopografia.com" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "demo.superadmin@terraqo.com" }, select: { id: true } })
  ]);
  if (!professional || !colleague || !companyAdmin || !superAdmin) throw new Error("Faltan accesos demo.");

  const professionalHub = await getConversationHub(professional.id);
  if (!professionalHub.conversations.some((conversation) => conversation.participants.some((participant) => participant.userId === colleague.id))) {
    throw new Error("El profesional no puede ver la conversacion entre pares.");
  }
  if (!professionalHub.conversations.some((conversation) => conversation.participants.some((participant) => participant.userId === companyAdmin.id))) {
    throw new Error("El profesional no puede ver la conversacion con empresa.");
  }

  const superAdminHub = await getConversationHub(superAdmin.id);
  if (superAdminHub.conversations.some((conversation) => !conversation.participants.some((participant) => participant.userId === superAdmin.id))) {
    throw new Error("El superadmin puede leer una conversacion privada sin ser participante.");
  }

  const outsider = await prisma.user.create({ data: { email: `messaging-outsider-${Date.now()}@example.test`, role: "CUSTOMER" } });
  try {
    let denied = false;
    try {
      await startConversation({ actorUserId: outsider.id, recipientUserId: professional.id });
    } catch (error) {
      denied = error instanceof TerraqoMessagingError && error.status === 403;
    }
    if (!denied) throw new Error("Un usuario sin workspace pudo iniciar una conversacion.");
  } finally {
    await prisma.user.delete({ where: { id: outsider.id } });
  }

  console.log("Messaging isolation: OK");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
