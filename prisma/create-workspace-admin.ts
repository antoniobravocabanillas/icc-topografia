import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function createTemporaryPassword() {
  return `Icc-${randomBytes(12).toString("base64url")}!9`;
}

async function main() {
  const workspaceSlug = process.env.WORKSPACE_SLUG?.trim() || "icc-topografia";
  const email = (process.env.WORKSPACE_ADMIN_EMAIL?.trim() || "admin@icctopografia.com").toLowerCase();
  const name = process.env.WORKSPACE_ADMIN_NAME?.trim() || "Administrador ICC Topografia";
  const configuredPassword = process.env.WORKSPACE_ADMIN_PASSWORD?.trim();

  const workspace = await prisma.terraqoWorkspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true, name: true, slug: true, active: true }
  });

  if (!workspace?.active) {
    throw new Error(`Workspace inexistente o inactivo: ${workspaceSlug}`);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true }
  });
  const temporaryPassword = configuredPassword || (!existingUser?.passwordHash ? createTemporaryPassword() : undefined);
  const passwordHash = temporaryPassword ? await bcrypt.hash(temporaryPassword, 12) : undefined;

  if (!existingUser && !passwordHash) {
    throw new Error("No se pudo generar la contrasena inicial del administrador.");
  }

  const user = await prisma.$transaction(async (tx) => {
    const workspaceAdmin = await tx.user.upsert({
      where: { email },
      update: {
        name,
        role: "ADMIN",
        ...(passwordHash ? { passwordHash } : {})
      },
      create: {
        name,
        email,
        role: "ADMIN",
        passwordHash: passwordHash as string
      },
      select: { id: true, name: true, email: true, role: true }
    });

    await tx.terraqoWorkspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: workspaceAdmin.id
        }
      },
      update: {
        role: "ADMIN",
        title: `Administrador del workspace ${workspace.name}`,
        active: true,
        joinedAt: new Date()
      },
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

    return workspaceAdmin;
  });

  console.log(`Workspace: ${workspace.name} (${workspace.slug})`);
  console.log(`Usuario: ${user.email}`);
  console.log(`Rol global: ${user.role}`);
  console.log("Rol del workspace: ADMIN");
  if (temporaryPassword) {
    console.log(`Contrasena temporal: ${temporaryPassword}`);
  } else {
    console.log("Contrasena: se conservo la existente");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
