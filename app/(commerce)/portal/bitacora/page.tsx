import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { WorklogCard } from "@/components/terraqo/worklog-card";
import { WorklogComposer } from "@/components/terraqo/worklog-composer";
import { prisma } from "@/lib/prisma";
import { getProfessionalProjects, requireProfessionalPortal, workspaceHasModules } from "@/lib/terraqo/professional-portal";
import { worklogInclude } from "@/lib/terraqo/worklog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorklogPageProps = {
  searchParams: Promise<{ fecha?: string }>;
};

function worklogDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function WorklogPage({ searchParams }: WorklogPageProps) {
  const params = await searchParams;
  const selectedDate = params.fecha && /^\d{4}-\d{2}-\d{2}$/.test(params.fecha) ? params.fecha : undefined;
  const { session, profile, memberships } = await requireProfessionalPortal();
  const enabledMemberships = memberships.filter((membership) => workspaceHasModules(membership.workspace, ["PROFESSIONAL_NETWORK", "LIVE_CV"]));
  const workspaceIds = enabledMemberships.map((membership) => membership.workspaceId);
  const [projects, worklogs] = await Promise.all([
    getProfessionalProjects(profile.id, workspaceIds),
    prisma.terraqoWorklogEntry.findMany({
      where: { professionalProfileId: profile.id, deletedAt: null },
      include: worklogInclude,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 90
    })
  ]);
  const days = Array.from(new Set(worklogs.map((worklog) => worklogDay(worklog.occurredAt))));
  const visibleWorklogs = selectedDate ? worklogs.filter((worklog) => worklogDay(worklog.occurredAt) === selectedDate) : worklogs;

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

        <section className="rounded-lg border bg-white p-5 shadow-technical">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Linea de tiempo</p>
              <h2 className="mt-1 font-display text-2xl font-bold">Bitacoras por fecha</h2>
              <p className="mt-2 text-sm text-muted-foreground">Selecciona un dia para revisar exactamente que evidencia fue generada.</p>
            </div>
            <Link href="/portal/bitacora" className={`rounded-md border px-4 py-2 text-sm font-semibold ${!selectedDate ? "bg-primary text-white" : "hover:bg-muted"}`}>Todas</Link>
          </div>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {days.map((day) => (
              <Link
                key={day}
                href={`/portal/bitacora?fecha=${day}`}
                className={`min-w-36 rounded-md border px-4 py-3 text-sm font-semibold transition ${selectedDate === day ? "border-primary bg-primary text-white" : "bg-white hover:bg-primary/10"}`}
              >
                <span className="block font-mono text-[11px] uppercase tracking-[0.12em] opacity-70">{new Intl.DateTimeFormat("es-PE", { weekday: "short" }).format(new Date(`${day}T12:00:00`))}</span>
                {new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${day}T12:00:00`))}
              </Link>
            ))}
            {!days.length ? <p className="text-sm text-muted-foreground">Tu calendario se activara con la primera bitacora.</p> : null}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          {visibleWorklogs.map((worklog) => <WorklogCard key={worklog.id} worklog={worklog} viewerId={session.user.id} />)}
        </div>
        {!visibleWorklogs.length ? <p className="rounded-lg border bg-white p-8 text-center text-muted-foreground">No hay bitacoras para esta fecha.</p> : null}
    </div>
  );
}
