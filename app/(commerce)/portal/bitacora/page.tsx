import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Filter,
  Search,
  X,
} from "lucide-react";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { WorklogCard } from "@/components/terraqo/worklog-card";
import { WorklogComposer } from "@/components/terraqo/worklog-composer";
import { WorkCaseOrganizer } from "@/components/terraqo/work-case-organizer";
import { prisma } from "@/lib/prisma";
import { listWorkCases } from "@/lib/terraqo/work-case";
import {
  getProfessionalProjects,
  requireProfessionalPortal,
  workspaceHasModules,
} from "@/lib/terraqo/professional-portal";
import {
  countWorklogArchive,
  getWorklogArchiveCalendar,
  getWorklogArchivePage,
} from "@/lib/terraqo/worklog-archive";
import {
  parseWorklogArchiveFilters,
  WorklogArchiveError,
  type WorklogArchiveInput,
} from "@/lib/terraqo/worklog-archive-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorklogPageProps = {
  searchParams: Promise<WorklogArchiveInput>;
};

const typeOptions = [
  ["FIELD_UPDATE", "Avance de trabajo"],
  ["DELIVERABLE", "Entregable"],
  ["PROBLEM_SOLVED", "Problema resuelto"],
  ["LEARNING", "Aprendizaje técnico"],
  ["MILESTONE", "Hito alcanzado"],
] as const;

function monthShift(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-PE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function calendarCells(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const mondayOffset =
    (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  return [
    ...Array.from({ length: mondayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
}

function archiveHref(
  filters: ReturnType<typeof parseWorklogArchiveFilters>,
  overrides: Record<string, string | null | undefined> = {},
) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.type) params.set("tipo", filters.type);
  if (filters.projectId) params.set("proyecto", filters.projectId);
  if (filters.evidenceStatus) params.set("estado", filters.evidenceStatus);
  if (filters.date) params.set("fecha", filters.date);
  if (filters.from) params.set("desde", filters.from);
  if (filters.to) params.set("hasta", filters.to);
  params.set("mes", filters.month);
  params.set("tz", filters.timeZone);
  for (const [key, value] of Object.entries(overrides)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return `/portal/bitacora?${params.toString()}`;
}

export default async function WorklogPage({ searchParams }: WorklogPageProps) {
  const params = await searchParams;
  const filters = parseWorklogArchiveFilters(params);
  const { session, profile, memberships } = await requireProfessionalPortal();
  const enabledMemberships = memberships.filter((membership) =>
    workspaceHasModules(membership.workspace, [
      "PROFESSIONAL_NETWORK",
      "LIVE_CV",
    ]),
  );
  const workspaceIds = enabledMemberships.map(
    (membership) => membership.workspaceId,
  );
  const workCasesEnabled = process.env.TERRAQO_WORK_CASES_V1 === "true";

  const archiveRequest = {
    professionalProfileId: profile.id,
    filters,
  };
  const archivePagePromise = getWorklogArchivePage({
    ...archiveRequest,
    cursor: params.cursor,
  })
    .then((page) => ({ page, cursorError: null as string | null }))
    .catch(async (error: unknown) => {
      if (!(error instanceof WorklogArchiveError)) throw error;
      return {
        page: await getWorklogArchivePage(archiveRequest),
        cursorError: error.message,
      };
    });

  const [projects, archiveResult, calendarCounts, totalCount, continuityRows, workCases] =
    await Promise.all([
      getProfessionalProjects(profile.id, workspaceIds),
      archivePagePromise,
      getWorklogArchiveCalendar(archiveRequest),
      countWorklogArchive(archiveRequest),
      prisma.terraqoWorklogEntry.findMany({
        where: { professionalProfileId: profile.id, deletedAt: null },
        select: {
          id: true,
          title: true,
          occurredAt: true,
          workspaceId: true,
          projectId: true,
          previousWorklogId: true,
          nextWorklog: { select: { id: true } },
          workCaseLinks: { select: { workCaseId: true }, take: 1 },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 200,
      }),
      workCasesEnabled ? listWorkCases(session.user.id) : Promise.resolve([]),
    ]);

  const continuityOptions = continuityRows.map((worklog) => ({
    id: worklog.id,
    title: worklog.title,
    occurredAt: worklog.occurredAt.toISOString(),
    workspaceId: worklog.workspaceId,
    projectId: worklog.projectId,
    previousWorklogId: worklog.previousWorklogId,
    hasNext: Boolean(worklog.nextWorklog),
  }));
  const workspaceOptions = [
    { id: "", name: "Perfil personal Terraqo", projects: [] },
    ...enabledMemberships.map((membership) => ({
      id: membership.workspaceId,
      name: membership.workspace.brandName || membership.workspace.name,
      projects: projects
        .filter(
          (project) => project.terraqoWorkspaceId === membership.workspaceId,
        )
        .map((project) => ({ id: project.id, title: project.title })),
    })),
  ];
  const [year, monthNumber] = filters.month.split("-").map(Number);
  const calendarDays = calendarCells(filters.month);
  const hasActiveFilters = Boolean(
    filters.query ||
      filters.type ||
      filters.projectId ||
      filters.evidenceStatus ||
      filters.date ||
      filters.from ||
      filters.to,
  );
  const selectedProject = projects.find(
    (project) => project.id === filters.projectId,
  );
  const activeFilterChips = [
    filters.query
      ? {
          key: "q",
          label: `Texto: ${filters.query}`,
        }
      : null,
    filters.type
      ? {
          key: "tipo",
          label:
            typeOptions.find(([value]) => value === filters.type)?.[1] ||
            filters.type,
        }
      : null,
    filters.projectId
      ? {
          key: "proyecto",
          label: `Proyecto: ${selectedProject?.title || "seleccionado"}`,
        }
      : null,
    filters.evidenceStatus
      ? {
          key: "estado",
          label:
            {
              DECLARED: "Estado: declarada",
              LINKED: "Estado: vinculada",
              CONFIRMED: "Estado: confirmada",
              VERIFIED: "Estado: verificada",
            }[filters.evidenceStatus] || filters.evidenceStatus,
        }
      : null,
    filters.date
      ? { key: "fecha", label: `Fecha: ${filters.date}` }
      : null,
    filters.from
      ? { key: "desde", label: `Desde: ${filters.from}` }
      : null,
    filters.to ? { key: "hasta", label: `Hasta: ${filters.to}` } : null,
  ].filter(
    (chip): chip is { key: string; label: string } => Boolean(chip),
  );

  return (
    <div className="min-w-0 space-y-5 py-4 sm:space-y-8 sm:py-6 lg:py-8">
      <PortalPageHeading
        eyebrow="CV vivo"
        title="Tu trabajo habla por ti."
        description="Convierte avances, decisiones y entregables en una trayectoria verificable. Cada entrada conserva su contexto, proyecto y nivel de visibilidad."
      />

      <WorklogComposer
        draftOwnerKey={profile.id}
        workspaces={workspaceOptions}
        previousWorklogs={continuityOptions}
      />

      {workCasesEnabled ? (
        <WorkCaseOrganizer
          worklogs={continuityRows.map((worklog) => ({
            id: worklog.id,
            title: worklog.title,
            occurredAt: worklog.occurredAt.toISOString(),
            workspaceId: worklog.workspaceId,
            projectId: worklog.projectId,
            workCaseId: worklog.workCaseLinks[0]?.workCaseId || null,
          }))}
          initialCases={workCases.map((workCase) => ({
            id: workCase.id,
            title: workCase.title,
            description: workCase.description,
            version: workCase.version,
            records: workCase.records.map((record) => ({
              id: record.id,
              worklogId: record.worklogId,
              phase: record.phase,
              worklog: {
                id: record.worklog.id,
                title: record.worklog.title,
                occurredAt: record.worklog.occurredAt.toISOString(),
              },
            })),
          }))}
        />
      ) : null}

      <section
        aria-labelledby="archive-title"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-technical"
      >
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-[#08243a] to-[#0b4256] px-4 py-5 text-white sm:px-6">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
            Archivo profesional
          </p>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 id="archive-title" className="font-display text-2xl font-bold">
                Encuentra una bitácora sin perder contexto
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
                Busca por contenido, tipo, proyecto o fecha. Los filtros quedan en
                la URL para volver, compartir o continuar después.
              </p>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm backdrop-blur">
              <strong>{totalCount}</strong>{" "}
              {totalCount === 1 ? "registro encontrado" : "registros encontrados"}
            </div>
          </div>
        </div>

        <form
          action="/portal/bitacora"
          method="get"
          className="grid gap-4 border-b border-slate-200 bg-slate-50/80 p-4 sm:p-6 lg:grid-cols-12"
        >
          <input type="hidden" name="tz" value={filters.timeZone} />
          <div className="lg:col-span-4">
            <label htmlFor="worklog-search" className="text-sm font-semibold">
              Buscar en tus registros
            </label>
            <div className="relative mt-2">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id="worklog-search"
                name="q"
                defaultValue={filters.query}
                maxLength={120}
                placeholder="Título, detalle o resultado"
                className="min-h-11 w-full rounded-lg border bg-white py-2 pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="worklog-type" className="text-sm font-semibold">
              Tipo de registro
            </label>
            <select
              id="worklog-type"
              name="tipo"
              defaultValue={filters.type || ""}
              className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Todos los tipos</option>
              {typeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-3">
            <label htmlFor="worklog-project" className="text-sm font-semibold">
              Proyecto
            </label>
            <select
              id="worklog-project"
              name="proyecto"
              defaultValue={filters.projectId || ""}
              className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Todos los proyectos</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-3">
            <label htmlFor="worklog-status" className="text-sm font-semibold">
              Estado de evidencia
            </label>
            <select
              id="worklog-status"
              name="estado"
              defaultValue={filters.evidenceStatus || ""}
              className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Todos los estados</option>
              <option value="DECLARED">Declarada</option>
              <option value="LINKED">Vinculada</option>
              <option value="CONFIRMED">Confirmada</option>
              <option value="VERIFIED">Verificada</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="worklog-month" className="text-sm font-semibold">
              Mes del calendario
            </label>
            <input
              id="worklog-month"
              name="mes"
              type="month"
              defaultValue={filters.month}
              className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="worklog-from" className="text-sm font-semibold">
              Desde
            </label>
            <input
              id="worklog-from"
              name="desde"
              type="date"
              defaultValue={filters.from}
              className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="worklog-to" className="text-sm font-semibold">
              Hasta
            </label>
            <input
              id="worklog-to"
              name="hasta"
              type="date"
              defaultValue={filters.to}
              className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2 lg:col-span-6">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Filter aria-hidden="true" className="h-4 w-4" />
              Aplicar filtros
            </button>
            {hasActiveFilters ? (
              <Link
                href={`/portal/bitacora?mes=${filters.month}&tz=${encodeURIComponent(filters.timeZone)}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X aria-hidden="true" className="h-4 w-4" />
                Limpiar filtros
              </Link>
            ) : null}
          </div>
        </form>

        {activeFilterChips.length ? (
          <div
            aria-label="Filtros activos"
            className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6"
          >
            <span className="mr-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Filtros activos
            </span>
            {activeFilterChips.map((chip) => (
              <Link
                key={chip.key}
                href={archiveHref(filters, {
                  [chip.key]: null,
                  cursor: null,
                })}
                aria-label={`Quitar filtro ${chip.label}`}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {chip.label}
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        ) : null}

        <div className="grid gap-0 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={archiveHref(filters, {
                  mes: monthShift(filters.month, -1),
                  fecha: null,
                  desde: null,
                  hasta: null,
                  cursor: null,
                })}
                aria-label="Ver mes anterior"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              </Link>
              <div className="text-center">
                <CalendarDays
                  aria-hidden="true"
                  className="mx-auto h-5 w-5 text-primary"
                />
                <h3 className="mt-1 font-display text-lg font-bold capitalize">
                  {monthLabel(filters.month)}
                </h3>
              </div>
              <Link
                href={archiveHref(filters, {
                  mes: monthShift(filters.month, 1),
                  fecha: null,
                  desde: null,
                  hasta: null,
                  cursor: null,
                })}
                aria-label="Ver mes siguiente"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-5 grid grid-cols-7 gap-1 text-center">
              {["L", "M", "M", "J", "V", "S", "D"].map((label, index) => (
                <span
                  key={`${label}-${index}`}
                  className="py-1 text-[10px] font-bold uppercase text-muted-foreground"
                >
                  {label}
                </span>
              ))}
              {calendarDays.map((day, index) => {
                if (!day) return <span key={`empty-${index}`} aria-hidden="true" />;
                const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const count = calendarCounts.get(date) || 0;
                const selected = filters.date === date;
                return (
                  <Link
                    key={date}
                    href={archiveHref(filters, {
                      fecha: date,
                      cursor: null,
                    })}
                    aria-label={`${day} de ${monthLabel(filters.month)}${count ? `, ${count} registros` : ", sin registros"}`}
                    aria-current={selected ? "date" : undefined}
                    className={`relative flex aspect-square min-h-9 items-center justify-center rounded-lg text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      selected
                        ? "bg-primary text-white shadow-sm"
                        : count
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "text-slate-400 hover:bg-muted"
                    }`}
                  >
                    {day}
                    {count ? (
                      <span
                        aria-hidden="true"
                        className={`absolute bottom-1 h-1 w-1 rounded-full ${selected ? "bg-white" : "bg-primary"}`}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
            {filters.date ? (
              <Link
                href={archiveHref(filters, {
                  fecha: null,
                  desde: null,
                  hasta: null,
                  cursor: null,
                })}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Ver todo {monthLabel(filters.month)}
              </Link>
            ) : null}
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Fechas calculadas en {filters.timeZone.replace("_", " ")}. Los
              días con actividad están destacados.
            </p>
          </aside>

          <div className="min-w-0 p-4 sm:p-6">
            {archiveResult.cursorError ? (
              <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {archiveResult.cursorError} Se mostró la primera página del archivo.
              </p>
            ) : null}
            <div className="flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                  Resultados
                </p>
                <h3 className="mt-1 font-display text-xl font-bold">
                  {filters.date
                    ? new Intl.DateTimeFormat("es-PE", {
                        dateStyle: "long",
                        timeZone: "UTC",
                      }).format(new Date(`${filters.date}T12:00:00Z`))
                    : monthLabel(filters.month)}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Hasta {filters.limit} registros por página
              </p>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              {archiveResult.page.items.map((worklog) => (
                <WorklogCard
                  key={worklog.id}
                  worklog={worklog}
                  viewerId={session.user.id}
                  continuityOptions={continuityOptions}
                  timeZone={filters.timeZone}
                />
              ))}
            </div>
            {!archiveResult.page.items.length ? (
              <div className="mt-5 rounded-xl border border-dashed bg-slate-50 px-6 py-12 text-center">
                <Search aria-hidden="true" className="mx-auto h-6 w-6 text-slate-400" />
                <h4 className="mt-3 font-display text-lg font-bold">
                  No encontramos bitácoras con estos filtros
                </h4>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Prueba otro mes, elimina un filtro o registra una nueva actividad profesional.
                </p>
              </div>
            ) : null}
            {archiveResult.page.nextCursor ? (
              <div className="mt-6 flex justify-center border-t pt-6">
                <Link
                  href={archiveHref(filters, {
                    cursor: archiveResult.page.nextCursor,
                  })}
                  scroll={false}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary bg-white px-5 py-2 text-sm font-bold text-primary transition hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  Ver siguientes registros
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
