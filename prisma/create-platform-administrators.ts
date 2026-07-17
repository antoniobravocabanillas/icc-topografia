import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function temporaryPassword(prefix: string) {
  return `${prefix}-${randomBytes(14).toString("base64url")}!7`;
}

async function main() {
  const workspaceSlug = process.env.ICC_WORKSPACE_SLUG?.trim() || "icc-topografia";
  const platformEmail = (process.env.TERRAQO_ADMIN_EMAIL?.trim() || "admin@terraqoglobal.com").toLowerCase();
  const workspaceEmail = (process.env.ICC_ADMIN_EMAIL?.trim() || "admin@icctopografia.com").toLowerCase();
  const platformPassword = process.env.TERRAQO_ADMIN_PASSWORD?.trim() || temporaryPassword("Tq");
  const workspacePassword = process.env.ICC_ADMIN_PASSWORD?.trim() || temporaryPassword("Icc");

  const workspace = await prisma.terraqoWorkspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true, name: true, active: true }
  });
  if (!workspace?.active) throw new Error(`Workspace inexistente o inactivo: ${workspaceSlug}`);

  const [platformPasswordHash, workspacePasswordHash] = await Promise.all([
    bcrypt.hash(platformPassword, 12),
    bcrypt.hash(workspacePassword, 12)
  ]);

  const result = await prisma.$transaction(async (tx) => {
    const platformAdmin = await tx.user.upsert({
      where: { email: platformEmail },
      update: { name: "Administrador Terraqo", role: "SUPER_ADMIN", passwordHash: platformPasswordHash },
      create: { name: "Administrador Terraqo", email: platformEmail, role: "SUPER_ADMIN", passwordHash: platformPasswordHash },
      select: { id: true, email: true, role: true }
    });

    const workspaceAdmin = await tx.user.upsert({
      where: { email: workspaceEmail },
      update: { name: `Administrador ${workspace.name}`, role: "ADMIN", passwordHash: workspacePasswordHash },
      create: { name: `Administrador ${workspace.name}`, email: workspaceEmail, role: "ADMIN", passwordHash: workspacePasswordHash },
      select: { id: true, email: true, role: true }
    });

    await tx.terraqoWorkspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: workspaceAdmin.id } },
      update: { role: "ADMIN", title: `Administrador del workspace ${workspace.name}`, active: true, joinedAt: new Date() },
      create: {
        workspaceId: workspace.id,
        userId: workspaceAdmin.id,
        role: "ADMIN",
        title: `Administrador del workspace ${workspace.name}`,
        active: true,
        invitedAt: new Date(),
        joinedAt: new Date()
      }
    });

    return { platformAdmin, workspaceAdmin };
  });

  console.log(JSON.stringify({
    platformAdmin: { ...result.platformAdmin, password: platformPassword, scope: "ALL_TERRAQO" },
    workspaceAdmin: { ...result.workspaceAdmin, password: workspacePassword, scope: workspaceSlug }
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
