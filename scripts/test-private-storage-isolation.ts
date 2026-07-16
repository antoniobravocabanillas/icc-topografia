import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rollbackMessage = "PRIVATE_STORAGE_TEST_ROLLBACK";

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const [owner, reviewer, outsider] = await Promise.all([
        tx.user.create({ data: { email: `storage-owner-${suffix}@test.terraqo.local` } }),
        tx.user.create({ data: { email: `storage-reviewer-${suffix}@test.terraqo.local` } }),
        tx.user.create({ data: { email: `storage-outsider-${suffix}@test.terraqo.local` } })
      ]);
      const [workspace, otherWorkspace] = await Promise.all([
        tx.terraqoWorkspace.create({ data: { name: `Storage test ${suffix}`, slug: `storage-test-${suffix}` } }),
        tx.terraqoWorkspace.create({ data: { name: `Other test ${suffix}`, slug: `other-storage-test-${suffix}` } })
      ]);
      await tx.terraqoWorkspaceMember.createMany({ data: [
        { workspaceId: workspace.id, userId: owner.id, role: "PROFESSIONAL" },
        { workspaceId: workspace.id, userId: reviewer.id, role: "ADMIN" },
        { workspaceId: otherWorkspace.id, userId: outsider.id, role: "ADMIN" }
      ] });

      await tx.terraqoPrivateNote.create({ data: { userId: owner.id, workspaceId: workspace.id, kind: "SECURE", securePayload: "ciphertext-only-test-payload-that-is-long-enough-and-contains-no-plaintext" } });
      await tx.terraqoWorkspaceFile.createMany({ data: [
        { userId: owner.id, workspaceId: workspace.id, category: "PLAN", visibility: "PRIVATE", title: "Private", storageKey: `private-${suffix}`, fileName: "private.dwg", contentType: "application/dwg", size: 10 },
        { userId: owner.id, workspaceId: workspace.id, category: "REPORT", visibility: "WORKSPACE", title: "Shared", storageKey: `shared-${suffix}`, fileName: "shared.pdf", contentType: "application/pdf", size: 10 }
      ] });

      const ownerNotes = await tx.terraqoPrivateNote.count({ where: { userId: owner.id, workspaceId: workspace.id } });
      const reviewerNotes = await tx.terraqoPrivateNote.count({ where: { userId: reviewer.id, workspaceId: workspace.id } });
      const reviewerFiles = await tx.terraqoWorkspaceFile.count({ where: { workspaceId: workspace.id, visibility: "WORKSPACE" } });
      const outsiderFiles = await tx.terraqoWorkspaceFile.count({ where: { workspaceId: otherWorkspace.id, visibility: "WORKSPACE" } });
      const privateLeak = await tx.terraqoWorkspaceFile.count({ where: { workspaceId: workspace.id, visibility: "PRIVATE", userId: { not: reviewer.id } } });

      if (ownerNotes !== 1 || reviewerNotes !== 0) throw new Error("Las notas no respetan el aislamiento por propietario.");
      if (reviewerFiles !== 1 || outsiderFiles !== 0) throw new Error("Los archivos compartidos cruzan el limite del workspace.");
      if (privateLeak !== 1) throw new Error("La precondicion del archivo privado no pudo verificarse.");
      throw new Error(rollbackMessage);
    });
  } catch (error) {
    if (error instanceof Error && error.message === rollbackMessage) {
      console.log("OK: notas personales y archivos privados/compartidos respetan usuario y workspace.");
      return;
    }
    throw error;
  }
}

main().finally(() => prisma.$disconnect());
