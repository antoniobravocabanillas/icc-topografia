import bcrypt from "bcryptjs";
import { PrismaClient, type Role, type TerraqoMemberRole } from "@prisma/client";

const prisma = new PrismaClient();

const accounts = [
  {
    key: "SUPERADMIN",
    email: "demo.superadmin@terraqo.com",
    name: "Demo Superadmin Terraqo",
    role: "SUPER_ADMIN" as Role,
    memberRole: "OWNER" as TerraqoMemberRole,
    title: "Control global Terraqo"
  },
  {
    key: "EMPRESA",
    email: "demo.empresa@icctopografia.com",
    name: "Demo Empresa ICC Topografia",
    role: "ADMIN" as Role,
    memberRole: "ADMIN" as TerraqoMemberRole,
    title: "Administrador del workspace"
  },
  {
    key: "PROFESIONAL",
    email: "demo.profesional@terraqo.com",
    name: "Andrea Campos",
    role: "CUSTOMER" as Role,
    memberRole: "PROFESSIONAL" as TerraqoMemberRole,
    title: "Especialista en control de obra"
  },
  {
    key: "COLEGA",
    email: "demo.colega@terraqo.com",
    name: "Luis Rivera",
    role: "CUSTOMER" as Role,
    memberRole: "PROFESSIONAL" as TerraqoMemberRole,
    title: "Operador LiDAR y drones"
  }
];

function passwordFor(key: string) {
  const value = process.env[`DEMO_${key}_PASSWORD`]?.trim();
  if (!value || value.length < 12) throw new Error(`Define DEMO_${key}_PASSWORD con al menos 12 caracteres.`);
  return value;
}

async function main() {
  const workspace = await prisma.terraqoWorkspace.findUnique({
    where: { slug: process.env.WORKSPACE_SLUG?.trim() || "icc-topografia" },
    select: { id: true, name: true, slug: true }
  });
  if (!workspace) throw new Error("No se encontro el workspace ICC Topografia.");

  const users = new Map<string, { id: string; email: string; name: string | null }>();
  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(passwordFor(account.key), 12);
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { name: account.name, role: account.role, passwordHash },
      create: { email: account.email, name: account.name, role: account.role, passwordHash },
      select: { id: true, email: true, name: true }
    });
    users.set(account.key, user);
    await prisma.terraqoWorkspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      update: { role: account.memberRole, title: account.title, active: true, joinedAt: new Date() },
      create: { workspaceId: workspace.id, userId: user.id, role: account.memberRole, title: account.title, active: true, invitedAt: new Date(), joinedAt: new Date() }
    });
  }

  const professionalDefinitions = [
    { key: "PROFESIONAL", headline: "Especialista en control topografico de obra", specialties: ["Topografia", "Control de obra"], equipment: ["Estacion total", "GNSS RTK"], software: ["AutoCAD", "Civil 3D"] },
    { key: "COLEGA", headline: "Operador LiDAR y fotogrametria", specialties: ["LiDAR", "Fotogrametria"], equipment: ["Escaner laser", "Drone RTK"], software: ["Cyclone", "Agisoft Metashape"] }
  ];
  for (const definition of professionalDefinitions) {
    const user = users.get(definition.key)!;
    await prisma.terraqoProfessionalProfile.upsert({
      where: { userId: user.id },
      update: {
        headline: definition.headline,
        bio: "Perfil demostrativo para recorrer la red profesional Terraqo.",
        city: "Lima",
        status: "OPEN_TO_PROJECTS",
        visibility: "COMMUNITY",
        liveCvEnabled: true,
        liveCvVisibility: "COMMUNITY",
        specialties: definition.specialties,
        equipment: definition.equipment,
        software: definition.software,
        termsAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
        termsVersion: "demo-2026-07"
      },
      create: {
        userId: user.id,
        headline: definition.headline,
        bio: "Perfil demostrativo para recorrer la red profesional Terraqo.",
        city: "Lima",
        status: "OPEN_TO_PROJECTS",
        visibility: "COMMUNITY",
        liveCvEnabled: true,
        liveCvVisibility: "COMMUNITY",
        specialties: definition.specialties,
        equipment: definition.equipment,
        software: definition.software,
        termsAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
        termsVersion: "demo-2026-07",
        onboardingSource: "TERRAQO_DEMO"
      }
    });
  }

  const seedConversation = async (leftKey: string, rightKey: string, body: string) => {
    const left = users.get(leftKey)!;
    const right = users.get(rightKey)!;
    const pair = [left.id, right.id].sort().join(":");
    const directKey = `${workspace.id}:direct:${pair}`;
    const existing = await prisma.terraqoConversation.findUnique({ where: { directKey }, select: { id: true, messages: { take: 1, select: { id: true } } } });
    const conversation = existing || await prisma.terraqoConversation.create({
      data: {
        type: leftKey === "EMPRESA" ? "COMPANY" : "DIRECT",
        directKey,
        workspaceId: workspace.id,
        createdById: left.id,
        participants: { create: [{ userId: left.id, role: "OWNER" }, { userId: right.id, role: "MEMBER" }] }
      },
      select: { id: true, messages: { take: 1, select: { id: true } } }
    });
    if (!conversation.messages.length) {
      const message = await prisma.terraqoDirectMessage.create({ data: { conversationId: conversation.id, senderId: left.id, body } });
      await prisma.terraqoConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.createdAt } });
    }
  };

  await seedConversation("EMPRESA", "PROFESIONAL", "Hola Andrea. Este espacio conecta la coordinacion de ICC Topografia con tu avance profesional.");
  await seedConversation("PROFESIONAL", "COLEGA", "Hola Luis. Probemos este canal para coordinar una posible colaboracion tecnica.");

  console.log(`Workspace demo: ${workspace.name} (${workspace.slug})`);
  for (const account of accounts) console.log(`${account.key}: ${account.email}`);
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
