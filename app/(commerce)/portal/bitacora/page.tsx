import { LockKeyhole } from "lucide-react";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { WorklogCard } from "@/components/terraqo/worklog-card";
import { WorklogComposer } from "@/components/terraqo/worklog-composer";
import { prisma } from "@/lib/prisma";
import { getProfessionalProjects, requireProfessionalPortal, workspaceHasModules } from "@/lib/terraqo/professional-portal";
import { worklogInclude } from "@/lib/terraqo/worklog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorklogPage() {
  const { session, profile, memberships } = await requireProfessionalPortal();
  const enabledMemberships = memberships.filter((membership) => workspaceHasModules(membership.workspace, ["PROFESSIONAL_NETWORK", "LIVE_CV"]));
  const workspaceIds = enabledMemberships.map((membership) => membership.workspaceId);
  const [projects, worklogs] = await Promise.all([
    getProfessionalProjects(profile.id, workspaceIds),
    prisma.terraqoWorklogEntry.findMany({
      where: { professionalProfileId: profile.id, deletedAt: null },
      include: worklogInclude,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 50
    })
  ]);

  const workspaceOptions = enabledMemberships.map((membership) => ({
    id: membership.workspaceId,
    name: membership.workspace.brandName || membership.workspace.name,
    projects: projects.filter((project) => project.terraqoWorkspaceId === membership.workspaceId).map((project) => ({ id: project.id, title: project.title }))
  }));

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
        <PortalPageHeading eyebrow="CV vivo" title="Tu trabajo habla por ti." description="Convierte avances, decisiones y entregables en una trayectoria verificable. Cada entrada conserva su contexto, proyecto y nivel de visibilidad." />

        {workspaceOptions.length ? <WorklogComposer workspaces={workspaceOptions} /> : (
          <div className="rounded-lg border bg-white p-7 shadow-technical">
            <LockKeyhole className="h-6 w-6 text-primary" />
            <h2 className="mt-4 font-display text-2xl font-bold">Bitacora pendiente de activacion</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">Tu empresa debe habilitar Red profesional y CV vivo en el workspace donde participas.</p>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-2">
          {worklogs.map((worklog) => <WorklogCard key={worklog.id} worklog={worklog} viewerId={session.user.id} />)}
        </div>
        {!worklogs.length ? <p className="rounded-lg border bg-white p-8 text-center text-muted-foreground">Aun no hay entradas. Tu primera evidencia puede ser un avance, un entregable o un problema resuelto.</p> : null}
    </div>
  );
}
