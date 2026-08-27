"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSessionTerraqoWorkspace } from "@/lib/terraqo/workspace-scope";

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function requestProfessionalAffiliationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const workspaceId = value(formData, "workspaceId");
  const roleTitle = value(formData, "roleTitle");
  if (!workspaceId || roleTitle.length < 2) redirect("/portal/perfil?affiliation=missing");

  const [profile, workspace] = await Promise.all([
    prisma.terraqoProfessionalProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } }),
    prisma.terraqoWorkspace.findFirst({
      where: { id: workspaceId, active: true, deletedAt: null, companyId: { not: null } },
      select: { id: true, name: true, brandName: true, companyId: true }
    })
  ]);
  if (!profile) redirect("/portal/perfil?affiliation=no-profile");
  if (!workspace) redirect("/portal/perfil?affiliation=invalid-company");

  const companyName = workspace.brandName || workspace.name;
  await prisma.$transaction(async (tx) => {
    await tx.terraqoProfessionalAffiliation.upsert({
      where: { professionalProfileId_workspaceId: { professionalProfileId: profile.id, workspaceId } },
      update: {
        companyId: workspace.companyId,
        companyName,
        roleTitle,
        current: true,
        verificationStatus: "REQUESTED",
        visibility: "PRIVATE",
        endedAt: null
      },
      create: {
        professionalProfileId: profile.id,
        workspaceId,
        companyId: workspace.companyId,
        companyName,
        roleTitle,
        current: true,
        verificationStatus: "REQUESTED",
        visibility: "PRIVATE"
      }
    });
    await tx.notification.create({
      data: {
        terraqoWorkspaceId: workspaceId,
        type: "SYSTEM",
        title: "Solicitud de vinculación profesional",
        body: `${session.user.name || session.user.email || "Un profesional"} solicita vincularse como ${roleTitle}.`,
        href: "/admin/workspace/perfil#professional-affiliations"
      }
    });
  });

  revalidatePath("/portal/perfil");
  revalidatePath("/admin/workspace/perfil");
  redirect("/portal/perfil?affiliation=requested");
}

export async function reviewProfessionalAffiliationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const sessionWorkspace = await getSessionTerraqoWorkspace();
  const workspace = await prisma.terraqoWorkspace.findUnique({
    where: { id: sessionWorkspace.id },
    select: { id: true, name: true, brandName: true, slug: true, publicSlug: true }
  });
  if (!workspace) redirect("/admin/workspace/perfil?affiliation=invalid");
  const affiliationId = value(formData, "affiliationId");
  const decision = value(formData, "decision");
  const roleTitle = value(formData, "roleTitle");
  if (!affiliationId || !["approve", "reject"].includes(decision)) {
    redirect("/admin/workspace/perfil?affiliation=invalid");
  }

  const affiliation = await prisma.terraqoProfessionalAffiliation.findFirst({
    where: { id: affiliationId, workspaceId: workspace.id, verificationStatus: "REQUESTED" },
    include: { professionalProfile: { select: { userId: true } } }
  });
  if (!affiliation) redirect("/admin/workspace/perfil?affiliation=not-found");

  const approved = decision === "approve";
  await prisma.$transaction(async (tx) => {
    await tx.terraqoProfessionalAffiliation.update({
      where: { id: affiliation.id },
      data: {
        roleTitle: roleTitle || affiliation.roleTitle,
        verificationStatus: approved ? "VERIFIED" : "REJECTED",
        current: approved,
        visibility: approved ? "WORKSPACE" : "PRIVATE",
        startedAt: approved ? affiliation.startedAt || new Date() : affiliation.startedAt,
        endedAt: approved ? null : new Date()
      }
    });
    if (approved) {
      await tx.terraqoWorkspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: affiliation.professionalProfile.userId } },
        update: { role: "PROFESSIONAL", title: roleTitle || affiliation.roleTitle, active: true, joinedAt: new Date() },
        create: {
          workspaceId: workspace.id,
          userId: affiliation.professionalProfile.userId,
          role: "PROFESSIONAL",
          title: roleTitle || affiliation.roleTitle,
          active: true,
          invitedAt: new Date(),
          joinedAt: new Date()
        }
      });
    }
    await tx.notification.create({
      data: {
        userId: affiliation.professionalProfile.userId,
        terraqoWorkspaceId: workspace.id,
        type: "SYSTEM",
        title: approved ? "Vinculación profesional aprobada" : "Solicitud de vinculación revisada",
        body: approved
          ? `${workspace.brandName || workspace.name} confirmó tu vínculo como ${roleTitle || affiliation.roleTitle || "profesional"}.`
          : `${workspace.brandName || workspace.name} no aprobó la solicitud de vínculo. Puedes corregir el cargo y volver a solicitarla.`,
        href: "/portal/perfil"
      }
    });
  });

  revalidatePath("/admin/workspace/perfil");
  revalidatePath("/portal/perfil");
  revalidatePath(`/empresas/${workspace.publicSlug || workspace.slug}`);
  redirect(`/admin/workspace/perfil?affiliation=${approved ? "approved" : "rejected"}#professional-affiliations`);
}
