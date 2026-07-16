import { prisma } from "../lib/prisma";
import { canViewWorklog, createProfessionalWorklog, visibleWorklogWhere } from "../lib/terraqo/worklog";

async function main() {
  const workspace = await prisma.terraqoWorkspace.findUnique({
    where: { slug: "icc-topografia" },
    select: {
      id: true,
      members: {
        where: { active: true, user: { terraqoProfessionalProfile: { isNot: null } } },
        select: { userId: true },
        take: 1
      }
    }
  });

  if (!workspace?.members[0]) throw new Error("ICC Topografia no tiene un profesional activo para la prueba.");

  const authorId = workspace.members[0].userId;
  let worklogId: string | undefined;

  try {
    const worklog = await createProfessionalWorklog({
      userId: authorId,
      requiredWorkspaceId: workspace.id,
      payload: {
        title: "Prueba temporal de aislamiento",
        summary: "Evidencia temporal creada para comprobar el aislamiento entre workspaces Terraqo.",
        type: "FIELD_UPDATE",
        visibility: "WORKSPACE",
        skills: ["tenant-isolation"],
        evidenceUrls: [],
        occurredAt: new Date()
      }
    });
    worklogId = worklog.id;

    const media = await prisma.terraqoWorklogMedia.create({
      data: {
        worklogId: worklog.id,
        storageKey: `test/${worklog.id}/evidence.jpg`,
        fileName: "evidence.jpg",
        contentType: "image/jpeg",
        size: 1024,
      },
    });

    const visibleToWorkspace = await prisma.terraqoWorklogEntry.count({
      where: { id: worklog.id, ...visibleWorklogWhere(authorId, [workspace.id]) }
    });

    const outsider = await prisma.terraqoWorkspaceMember.findFirst({
      where: { active: true, workspaceId: { not: workspace.id }, userId: { not: authorId } },
      select: { userId: true, workspaceId: true }
    });
    const visibleToOutsider = outsider
      ? await prisma.terraqoWorklogEntry.count({
          where: { id: worklog.id, ...visibleWorklogWhere(outsider.userId, [outsider.workspaceId]) }
        })
      : 0;

    const ownerCanReadEvidence = await canViewWorklog(authorId, media.worklogId);
    const outsiderCanReadEvidence = outsider ? await canViewWorklog(outsider.userId, media.worklogId) : null;

    if (visibleToWorkspace !== 1 || visibleToOutsider !== 0 || !ownerCanReadEvidence || outsiderCanReadEvidence) {
      throw new Error(`Aislamiento invalido: workspace=${visibleToWorkspace}, outsider=${visibleToOutsider}, evidenciaOwner=${Boolean(ownerCanReadEvidence)}, evidenciaOutsider=${Boolean(outsiderCanReadEvidence)}`);
    }

    console.log("Worklog and evidence isolation: OK");
  } finally {
    if (worklogId) {
      await prisma.terraqoWorklogEntry.delete({ where: { id: worklogId } });
      const orphanedMedia = await prisma.terraqoWorklogMedia.count({ where: { worklogId } });
      if (orphanedMedia) throw new Error("La evidencia no se elimino con su bitacora.");
    }
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
