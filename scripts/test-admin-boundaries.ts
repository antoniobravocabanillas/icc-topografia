import { prisma } from "../lib/prisma";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const [platformAdmin, workspaceAdmin, iccWorkspace] = await Promise.all([
    prisma.user.findUnique({
      where: { email: "admin@terraqoglobal.com" },
      include: { terraqoMemberships: { where: { active: true }, select: { workspaceId: true, role: true } } }
    }),
    prisma.user.findUnique({
      where: { email: "admin@icctopografia.com" },
      include: { terraqoMemberships: { where: { active: true }, select: { workspaceId: true, role: true } } }
    }),
    prisma.terraqoWorkspace.findUnique({ where: { slug: "icc-topografia" }, select: { id: true, active: true } })
  ]);

  assert(platformAdmin?.role === "SUPER_ADMIN", "El administrador Terraqo no tiene rol SUPER_ADMIN.");
  assert(workspaceAdmin?.role === "ADMIN", "El administrador ICC no tiene rol global ADMIN.");
  assert(iccWorkspace?.active, "El workspace ICC Topografia no esta activo.");

  const iccAdminMemberships = workspaceAdmin.terraqoMemberships.filter((membership) =>
    ["OWNER", "ADMIN", "MANAGER"].includes(membership.role)
  );
  assert(iccAdminMemberships.length === 1, "El administrador ICC debe controlar exactamente un workspace.");
  assert(iccAdminMemberships[0].workspaceId === iccWorkspace.id, "El administrador ICC esta vinculado a un workspace incorrecto.");

  console.log("Admin boundary test passed", {
    platformScope: "ALL_TERRAQO",
    workspaceScope: "icc-topografia",
    platformMemberships: platformAdmin.terraqoMemberships.length,
    workspaceAdminMemberships: iccAdminMemberships.length
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
