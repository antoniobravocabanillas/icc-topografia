"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderKanban,
  List,
  Lightbulb,
  LoaderCircle,
  MapPin,
  Milestone,
  Search,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  publicCvEvidenceHref,
  requestedPublicCvRecordId,
  isSyntheticPublicCvRecordId,
} from "@/lib/terraqo/public-cv-permalink";

import {
  archiveFilterKeys,
  readPublicArchiveFilters,
  publicArchiveQuery,
  publicArchiveApiQuery,
  publicArchivePath,
  type PublicArchiveFilters,
} from "@/lib/terraqo/public-archive-navigation";

export type PublicCvActivityRecord = {
  id: string;
  title: string;
  summary: string;
  outcome: string | null;
  type: string;
  evidenceStatus: string;
  occurredAt: string;
  createdAt: string;
  locationLabel: string | null;
  skills: string[];
  evidenceUrls: string[];
  project: {
    title: string;
    clientName: string | null;
    location: string | null;
    category: string | null;
    image: string | null;
  } | null;
  workspace: string | null;
  media: Array<{
    id: string;
    fileName: string;
    contentType: string;
    href: string;
    downloadHref: string;
  }>;
  validations: Array<{
    id: string;
    responseNote: string | null;
    resolvedAt: string | null;
    createdAt: string;
    validatorName: string | null;
    validatorImage: string | null;
  }>;
};

type EvidencePageItem = {
  id: string;
  title: string;
  summary: string;
  outcome: string | null;
  type: string;
  evidenceStatus: string;
  occurredAt: string;
  createdAt: string;
  locationLabel: string | null;
  skills: string[];
  evidenceUrls: string[];
  project: { id?: string; title: string } | null;
  workspace: { brandName: string | null; name: string } | null;
  media: Array<{ id: string; fileName: string; contentType: string }>;
  validations: PublicCvActivityRecord["validations"];
};

type EvidencePageResponse = {
  data?: {
    items: EvidencePageItem[];
    page: { hasMore: boolean; nextCursor: string | null };
    scopeCounts: { records: number };
    projects?: Array<{ id: string; title: string }>;
  };
  error?: { message?: string };
};

const TYPE_COPY: Record<
  string,
  { label: string; description: string; icon: LucideIcon; tone: string }
> = {
  FIELD_UPDATE: {
    label: "Actualización",
    description: "Avance profesional registrado",
    icon: ClipboardCheck,
    tone: "text-[#25c0d5] border-[#25c0d5]/35 bg-[#25c0d5]/10",
  },
  DELIVERABLE: {
    label: "Entregable",
    description: "Resultado o documento entregado",
    icon: FileCheck2,
    tone: "text-[#7fa8ff] border-[#4374ba]/45 bg-[#4374ba]/15",
  },
  PROBLEM_SOLVED: {
    label: "Solución",
    description: "Incidencia resuelta y documentada",
    icon: Wrench,
    tone: "text-[#f6be62] border-[#f6be62]/35 bg-[#f6be62]/10",
  },
  LEARNING: {
    label: "Aprendizaje",
    description: "Conocimiento incorporado al perfil",
    icon: Lightbulb,
    tone: "text-[#b6d56b] border-[#b6d56b]/35 bg-[#b6d56b]/10",
  },
  MILESTONE: {
    label: "Hito",
    description: "Hito relevante de la trayectoria",
    icon: Milestone,
    tone: "text-[#8ba7ff] border-[#488ac9]/45 bg-[#488ac9]/15",
  },
  EXPERIENCE_UPDATE: {
    label: "Experiencia",
    description: "Trayectoria profesional incorporada",
    icon: BriefcaseBusiness,
    tone: "text-[#25c0d5] border-[#25c0d5]/35 bg-[#25c0d5]/10",
  },
  EXPERIENCE_VALIDATION: {
    label: "Validación",
    description: "Experiencia profesional revisada",
    icon: BadgeCheck,
    tone: "text-[#57d9a6] border-[#57d9a6]/35 bg-[#57d9a6]/10",
  },
  EDUCATION_UPDATE: {
    label: "Formación",
    description: "Formación académica incorporada",
    icon: Sparkles,
    tone: "text-[#b6d56b] border-[#b6d56b]/35 bg-[#b6d56b]/10",
  },
  EDUCATION_VALIDATION: {
    label: "Validación",
    description: "Formación académica revisada",
    icon: BadgeCheck,
    tone: "text-[#57d9a6] border-[#57d9a6]/35 bg-[#57d9a6]/10",
  },
  DOCUMENT_VALIDATION: {
    label: "Documento",
    description: "Documento revisado por Terraqo",
    icon: FileCheck2,
    tone: "text-[#7fa8ff] border-[#4374ba]/45 bg-[#4374ba]/15",
  },
  PROJECT_ACTIVITY: {
    label: "Proyecto",
    description: "Proyecto vinculado a la trayectoria",
    icon: FolderKanban,
    tone: "text-[#f6be62] border-[#f6be62]/35 bg-[#f6be62]/10",
  },
};

function typeMeta(type: string) {
  return TYPE_COPY[type] || TYPE_COPY.FIELD_UPDATE;
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-PE", {
    ...options,
    timeZone: "America/Lima",
  })
    .format(new Date(value))
    .replace(/\./g, "");
}

function formatDay(value: string) {
  return formatDate(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).toUpperCase();
}

function archiveDateLabel(value: string) {
  const instant = value + "T12:00:00-05:00";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(instant))
    ? formatDate(instant, { day: "numeric", month: "short", year: "numeric" })
    : value;
}

function formatLongDate(value: string) {
  return formatDate(value, { day: "2-digit", month: "long", year: "numeric" });
}

function formatTime(value: string) {
  return formatDate(value, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function evidenceImage(record: PublicCvActivityRecord) {
  const media = record.media.find((item) =>
    item.contentType.startsWith("image/"),
  );
  if (media) return media.href;
  const externalImage = record.evidenceUrls.find((url) =>
    /\.(avif|jpe?g|png|webp)(\?.*)?$/i.test(url),
  );
  return externalImage || record.project?.image || null;
}

export function PublicCvActivityExplorer({
  username,
  profileName,
  records,
  initialRecordId,
  profileId,
}: {
  username: string;
  profileName: string;
  records: PublicCvActivityRecord[];
  initialRecordId?: string;
  profileId: string;
  initialNextCursor: string | null;
}) {
  const [filters, setFilters] = useState<PublicArchiveFilters>(
    readPublicArchiveFilters(""),
  );
  const [draft, setDraft] = useState(filters);
  const [entry, setEntry] = useState("");
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<EvidencePageItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [legacyId, setLegacyId] = useState<string | null>(null);
  const detailId = initialRecordId || legacyId;
  const [projects, setProjects] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [month, setMonth] = useState(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
    }).format(new Date()),
  );
  const [days, setDays] = useState<Record<string, number>>({});
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const activityQuery = publicArchiveApiQuery({ ...draft, from: "", to: "" });
  activityQuery.set("month", month);
  activityQuery.delete("period");
  const activitySearch = activityQuery.toString();
  const generation = useRef(0);
  const pending = useRef(false);
  const pages = useRef(1);
  const query = publicArchiveQuery(filters);
  const archiveHref = publicArchivePath(username, filters);
  const selected = detailId
    ? records.find((record) => record.id === detailId)
    : null;
  const restorationKey = `terraqo-public-archive:${profileId}:${entry}:${query}`;
  const control =
    "min-h-11 w-full min-w-0 rounded-lg border border-[#35506e] bg-[#101d2d] px-3 py-2 text-base text-[#f4f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7fa8ff]";
  const button =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#35506e] px-4 py-2 text-sm font-semibold text-[#f4f7fb] hover:bg-[#1b3149] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7fa8ff] disabled:opacity-50";

  useEffect(() => {
    function sync() {
      const next = readPublicArchiveFilters(window.location.search);
      setFilters(next);
      setDraft(next);
      setRangeStart(null);
      if (!initialRecordId) {
        let restoreEntry: string | null = null;
        try {
          restoreEntry = sessionStorage.getItem(`archive-return:${profileId}`);
          sessionStorage.removeItem(`archive-return:${profileId}`);
        } catch {}
        const id =
          restoreEntry ||
          window.history.state?.terraqoArchiveEntry ||
          crypto.randomUUID();
        window.history.replaceState(
          { ...window.history.state, terraqoArchiveEntry: id },
          "",
          window.location.href,
        );
        setEntry(id);
      }
      setReady(true);
      const requested = requestedPublicCvRecordId(window.location);
      setLegacyId(
        requested && isSyntheticPublicCvRecordId(requested) ? requested : null,
      );
      // Historical fragments must resolve on the server even outside the first page.
      if (
        requested &&
        !initialRecordId &&
        !isSyntheticPublicCvRecordId(requested)
      ) {
        const target = publicCvEvidenceHref(username, requested);
        const suffix = publicArchiveQuery(next);
        window.location.replace(`${target}${suffix ? `?${suffix}` : ""}`);
      }
    }
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [username, profileId, initialRecordId]);

  useEffect(() => {
    if (!ready || detailId) return;
    const controller = new AbortController();
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setItems([]);
    setTotal(null);
    setCursor(null);
    pending.current = true;
    async function load() {
      try {
        let restore: { pages?: number; scroll?: number; id?: string } = {};
        try {
          restore = JSON.parse(sessionStorage.getItem(restorationKey) || "{}");
        } catch {}
        // Restore only pages previously visited; never fetch the entire archive to filter it.
        const count = Math.max(1, Math.min(10, Number(restore.pages) || 1));
        let next: string | null = null;
        let collected: EvidencePageItem[] = [];
        for (let index = 0; index < count; index++) {
          const response = await fetch(
            `/api/v1/profiles/${encodeURIComponent(profileId)}/evidence?${publicArchiveApiQuery(filters, next)}`,
            { signal: controller.signal, cache: "no-store" },
          );
          const payload: EvidencePageResponse = await response.json();
          if (!response.ok || !payload.data)
            throw new Error(
              payload.error?.message || "No se pudieron cargar las bitácoras.",
            );
          collected = [...collected, ...payload.data.items];
          next = payload.data.page.nextCursor;
          if (current !== generation.current) return;
          if (payload.data.projects) setProjects(payload.data.projects);
          pages.current = index + 1;
          setItems(collected);
          setCursor(next);
          setTotal(payload.data.scopeCounts.records);
          if (!next) break;
        }
        if (current !== generation.current) return;
        setLoading(false);
        if (restore.scroll !== undefined)
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              window.scrollTo({
                top: restore.scroll || 0,
                behavior: "instant",
              });
              if (restore.id)
                document
                  .getElementById(`record-${restore.id}`)
                  ?.focus({ preventScroll: true });
            }),
          );
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "No se pudo conectar.",
          );
      } finally {
        if (current === generation.current) {
          setLoading(false);
          pending.current = false;
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      generation.current = current + 1;
    };
    // Filters are represented by the canonical query, preventing fetches on unrelated UI state.
  }, [ready, query, filters, profileId, detailId, retry, restorationKey]);

  useEffect(() => {
    if (!calendarOpen || detailId) return;
    const controller = new AbortController();
    setCalendarBusy(true);
    setCalendarError(null);
    setDays({});
    void fetch(
      `/api/v1/profiles/${encodeURIComponent(profileId)}/evidence/activity?${activitySearch}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.data)
          throw Error("No se pudo consultar la actividad del mes.");
        return payload.data.days as Array<{ date: string; count: number }>;
      })
      .then((values) => {
        if (!controller.signal.aborted)
          setDays(
            Object.fromEntries(values.map((day) => [day.date, day.count])),
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCalendarError(
            "No se pudo consultar el calendario. Puedes seleccionar un rango y aplicar los filtros.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCalendarBusy(false);
      });
    return () => controller.abort();
  }, [calendarOpen, activitySearch, profileId, detailId]);

  function apply(next: PublicArchiveFilters) {
    const href = publicArchivePath(username, next);
    window.history.replaceState(
      { ...window.history.state, terraqoScrollY: window.scrollY },
      "",
      window.location.href,
    );
    const nextEntry = crypto.randomUUID();
    window.history.pushState(
      {
        ...window.history.state,
        terraqoScrollY: 0,
        terraqoArchiveEntry: nextEntry,
      },
      "",
      href,
    );
    setEntry(nextEntry);
    try {
      sessionStorage.removeItem(
        `terraqo-public-archive:${profileId}:${publicArchiveQuery(next)}`,
      );
    } catch {}
    setFilters(next);
    setDraft(next);
    setRangeStart(null);
  }
  function remember(id: string) {
    try {
      sessionStorage.setItem(
        restorationKey,
        JSON.stringify({ pages: pages.current, scroll: window.scrollY, id }),
      );
      sessionStorage.setItem(`archive-last:${profileId}:${query}`, entry);
    } catch {}
  }
  async function more() {
    if (!cursor || pending.current) return;
    pending.current = true;
    setLoading(true);
    setError(null);
    const current = generation.current;
    try {
      const response = await fetch(
        `/api/v1/profiles/${encodeURIComponent(profileId)}/evidence?${publicArchiveApiQuery(filters, cursor)}`,
        { cache: "no-store" },
      );
      const payload: EvidencePageResponse = await response.json();
      if (!response.ok || !payload.data)
        throw Error(
          payload.error?.message || "No se pudieron cargar más registros.",
        );
      if (current !== generation.current) return;
      const data = payload.data;
      setItems((previous) =>
        Array.from(
          new Map(
            [...previous, ...data.items].map((item) => [item.id, item]),
          ).values(),
        ),
      );
      setCursor(data.page.nextCursor);
      setTotal(data.scopeCounts.records);
      pages.current++;
    } catch (cause) {
      if (current === generation.current)
        setError(
          cause instanceof Error ? cause.message : "No se pudo conectar.",
        );
    } finally {
      if (current === generation.current) {
        setLoading(false);
        pending.current = false;
      }
    }
  }
  async function copy() {
    if (!selected) return;
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(
        new URL(
          publicCvEvidenceHref(username, selected.id),
          window.location.origin,
        ).href,
      );
      setCopied(true);
    } catch {
      setCopyError(true);
    }
  }
  const projectOptions = projects.map((project) => [project.id, project.title]);
  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const [year, monthNumber] = monthValid
    ? month.split("-").map(Number)
    : [2026, 1];
  const firstDay =
    (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  function filterLabel(key: (typeof archiveFilterKeys)[number]) {
    const value = filters[key];
    if (key === "type") return typeMeta(value).label;
    if (key === "state")
      return (
        (
          {
            DECLARED: "Declarado",
            LINKED: "Vinculado",
            CONFIRMED: "Confirmado",
            VERIFIED: "Validado",
          } as Record<string, string>
        )[value] || "Estado seleccionado"
      );
    if (key === "projectId")
      return (
        projects.find((project) => project.id === value)?.title ||
        "Proyecto seleccionado"
      );
    if (key === "from") {
      const from = archiveDateLabel(value);
      if (!filters.to) return `Desde ${from}`;
      return filters.to === value ? from : `${from} – ${archiveDateLabel(filters.to)}`;
    }
    if (key === "to") return `Hasta ${archiveDateLabel(value)}`;
    return value;
  }
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Lima",
  }).format(new Date());
  return (
    <main
      style={{ colorScheme: "dark" }}
      className="min-h-screen bg-[#07111e] text-[#f4f7fb]"
    >
      <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-10">
        <nav
          aria-label="Navegación del perfil público"
          className="mb-6 flex gap-6 border-b border-[#294057] text-sm"
        >
          <Link
            href={`/cv/${encodeURIComponent(username)}`}
            className="flex min-h-12 items-center text-[#b8c9da] hover:text-white"
          >
            CV vivo
          </Link>
          <Link
            href={archiveHref}
            aria-current={!detailId ? "page" : undefined}
            className="flex min-h-12 items-center border-b-2 border-[#539bff] font-semibold"
          >
            Evidencias
          </Link>
        </nav>
        {detailId && <Link
          onClick={() => {
            if (detailId) {
              try {
                const saved = sessionStorage.getItem(
                  `archive-last:${profileId}:${query}`,
                );
                if (saved)
                  sessionStorage.setItem(`archive-return:${profileId}`, saved);
              } catch {}
            }
          }}
          href={archiveHref}
          className={button}
        >
          <ArrowLeft size={18} />
          Volver a las bitácoras
        </Link>}
        {detailId ? (
          <div className="mt-6">
            {selected ? (
              <ActivityDetail record={selected} copied={copied} onCopy={copy} />
            ) : (
              <p role="status">El registro no está disponible.</p>
            )}
            {copyError ? (
              <p role="alert" className="mt-4 text-[#e9bd63]">
                No se pudo copiar el enlace. Puedes copiar la dirección de esta
                página.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <header className="my-7 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-[#afbdcd]">
                  {profileName} · Trabajo documentado
                </p>
                <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
                  Archivo de evidencias
                </h1>
              </div>
              <p aria-live="polite" className="text-sm text-[#afbdcd]">
                {total === null
                  ? "Consultando registros…"
                  : `${total} ${total === 1 ? "bitácora" : "bitácoras"} en este resultado`}
              </p>
            </header>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                apply(draft);
              }}
            >
              <label className="flex-1">
                <span className="sr-only">
                  Buscar en todas las bitácoras públicas
                </span>
                <input
                  className={control}
                  maxLength={120}
                  value={draft.q}
                  onChange={(event) =>
                    setDraft({ ...draft, q: event.target.value })
                  }
                  placeholder="Buscar por trabajo, proyecto o habilidad"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={`${button} bg-[#255a97]`}>
                  <Search size={18} />
                  Buscar
                </button>
                <button
                  type="button"
                  className={button}
                  aria-expanded={filtersOpen}
                  onClick={() => {
                    setFiltersOpen(!filtersOpen);
                  }}
                >
                  <CalendarDays size={18} />
                  Filtros
                </button>
                <div
                  className="flex rounded-lg border border-[#35506e]"
                  aria-label="Vista del archivo"
                >
                  <button
                    type="button"
                    aria-pressed={!calendarOpen}
                    onClick={() => { setRangeStart(null); setCalendarOpen(false); }}
                    className={`${button} border-0 ${!calendarOpen ? "bg-[#2563eb]" : ""}`}
                  >
                    <List size={18} />
                    Lista
                  </button>
                  <button
                    type="button"
                    aria-pressed={calendarOpen}
                    onClick={() => setCalendarOpen(true)}
                    className={`${button} border-0 ${calendarOpen ? "bg-[#2563eb]" : ""}`}
                  >
                    <CalendarDays size={18} />
                    Calendario
                  </button>
                </div>
              </div>
            </form>
            {(filtersOpen || calendarOpen) && (
              <form
                className="my-5 rounded-xl border border-[#294057] bg-[#0b1b2b] p-4 sm:p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  apply(draft);
                }}
              >
                <div
                  className={`${filtersOpen ? "grid" : "hidden"} grid-cols-2 gap-4 lg:grid-cols-5`}
                >
                  <label className="text-sm">
                    Tipo
                    <select
                      aria-label="Tipo"
                      className={`${control} mt-2`}
                      value={draft.type}
                      onChange={(e) =>
                        setDraft({ ...draft, type: e.target.value })
                      }
                    >
                      <option value="">Todos los tipos</option>
                      {[
                        "FIELD_UPDATE",
                        "DELIVERABLE",
                        "PROBLEM_SOLVED",
                        "LEARNING",
                        "MILESTONE",
                      ].map((type) => (
                        <option value={type} key={type}>
                          {typeMeta(type).label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Estado
                    <select
                      aria-label="Estado"
                      className={`${control} mt-2`}
                      value={draft.state}
                      onChange={(e) =>
                        setDraft({ ...draft, state: e.target.value })
                      }
                    >
                      <option value="">Todos los estados</option>
                      <option value="DECLARED">Declarado</option>
                      <option value="LINKED">Vinculado</option>
                      <option value="CONFIRMED">Confirmado</option>
                      <option value="VERIFIED">Validado</option>
                    </select>
                  </label>
                  <label className="col-span-2 text-sm lg:col-span-1">
                    Proyecto
                    <select
                      aria-label="Proyecto"
                      className={`${control} mt-2`}
                      value={draft.projectId}
                      onChange={(e) =>
                        setDraft({ ...draft, projectId: e.target.value })
                      }
                    >
                      <option value="">Todos los proyectos</option>
                      {draft.projectId &&
                      !projectOptions.some(([id]) => id === draft.projectId) ? (
                        <option value={draft.projectId}>
                          Proyecto seleccionado
                        </option>
                      ) : null}
                      {projectOptions.map(([id, title]) => (
                        <option key={id} value={id}>
                          {title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Desde
                    <input
                      className={`${control} mt-2`}
                      type="date"
                      value={draft.from}
                      onChange={(e) => {
                        setRangeStart(null);
                        setDraft({ ...draft, from: e.target.value });
                      }}
                    />
                  </label>
                  <label className="text-sm">
                    Hasta
                    <input
                      className={`${control} mt-2`}
                      type="date"
                      min={draft.from || undefined}
                      value={draft.to}
                      onChange={(e) => {
                        setRangeStart(null);
                        setDraft({ ...draft, to: e.target.value });
                      }}
                    />
                  </label>
                </div>
                <div hidden={!calendarOpen} className="max-w-xl">
                  <label className="text-sm">
                    Actividad del mes
                    <input
                      className={`${control} mt-2`}
                      type="month"
                      required
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                    />
                  </label>
                  <p className="my-3 text-sm text-[#afbdcd]">
                    Los puntos indican registros públicos. Elige un día o marca los dos extremos del periodo.
                  </p>
                  {calendarError ? (
                    <p role="alert" className="text-sm text-[#e9bd63]">
                      {calendarError}
                    </p>
                  ) : null}
                  {calendarBusy ? (
                    <p role="status" className="text-sm text-[#afbdcd]">
                      Consultando actividad…
                    </p>
                  ) : null}
                  <div
                    className="grid grid-cols-7 gap-1"
                    aria-label="Calendario de actividad"
                  >
                    {["L", "M", "X", "J", "V", "S", "D"].map((label, i) => (
                      <span
                        key={i}
                        className="py-2 text-center text-sm text-[#afbdcd]"
                        aria-hidden="true"
                      >
                        {label}
                      </span>
                    ))}
                    {Array.from({ length: firstDay }, (_, i) => (
                      <span key={`blank-${i}`} />
                    ))}
                    {Array.from({ length: dayCount }, (_, i) => {
                      const date = `${month}-${String(i + 1).padStart(2, "0")}`;
                      const chosen =
                        date >= draft.from && date <= (draft.to || draft.from);
                      return (
                        <button
                          type="button"
                          key={date}
                          aria-label={`${date}${date === today ? ", hoy" : ""}: ${days[date] || 0} registros públicos`}
                          aria-pressed={chosen}
                          className={`flex min-h-11 flex-col items-center justify-center rounded-lg border text-sm ${chosen ? "border-[#8ecfff] bg-[#255a97]" : date === today ? "border-[#8ecfff]" : "border-transparent hover:bg-[#243d56]"}`}
                          onClick={() => {
                            const first = rangeStart || date;
                            setDraft({ ...draft, from: first < date ? first : date, to: first < date ? date : first });
                            setRangeStart(rangeStart ? null : date);
                          }}
                        >
                          {i + 1}
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${days[date] ? "bg-[#8ecfff]" : "bg-transparent"}`}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div
                  className="mt-4 flex flex-wrap gap-3"
                >
                  <button
                    type="submit"
                    className={`${button} flex-1 bg-[#255a97]`}
                  >
                    {filtersOpen ? "Aplicar filtros" : "Aplicar fechas"}
                  </button>
                  <button
                    type="button"
                    className={button}
                    onClick={() => apply(readPublicArchiveFilters(""))}
                  >
                    Limpiar
                  </button>
                </div>
              </form>
            )}
            <div className="my-4 flex flex-wrap items-center gap-2 text-sm text-[#afbdcd]">
              <span>Más recientes primero · Hora de Perú</span>
              {archiveFilterKeys
                .filter((key) => filters[key] && !(key === "to" && filters.from))
                .map((key) => (
                  <button
                    className={button}
                    key={key}
                    onClick={() => apply(key === "from" || key === "to" ? { ...filters, from: "", to: "" } : { ...filters, [key]: "" })}
                    aria-label={`${key === "from" || key === "to" ? "Quitar periodo" : "Quitar filtro"}: ${filterLabel(key)}`}
                  >
                    {filterLabel(key)} <span aria-hidden="true">×</span>
                  </button>
                ))}
              {query ? (
                <button
                  className={button}
                  onClick={() => apply(readPublicArchiveFilters(""))}
                >
                  Limpiar filtros
                </button>
              ) : null}
            </div>
            <div className="mb-2 hidden items-center justify-between rounded-lg border border-[#294057] bg-[#0b1b2b] px-6 py-3 text-sm text-[#b8c9da] sm:flex">
              <span>Evidencia</span>
              <span>Acciones</span>
            </div>
            <div aria-busy={loading} className="space-y-3">
              {items.map((item) => {
                const thumbnail = item.media.find((media) =>
                  media.contentType.startsWith("image/"),
                );
                const href = `${publicCvEvidenceHref(username, item.id)}${query ? `?${query}` : ""}`;
                return (
                  <Link
                    id={`record-${item.id}`}
                    key={item.id}
                    href={href}
                    prefetch={false}
                    onClick={() => remember(item.id)}
                    className="group flex items-start gap-4 rounded-xl border border-[#294057] bg-[#0b1b2b] p-3 hover:border-[#5986b5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7fa8ff] sm:items-center sm:gap-6"
                  >
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-[#101d2d] sm:h-28 sm:w-52">
                      {thumbnail ? (
                        <Image
                          src={`/api/public/cv/${encodeURIComponent(username)}/worklogs/${encodeURIComponent(thumbnail.id)}`}
                          alt=""
                          fill
                          sizes="(max-width:640px) 96px,208px"
                          unoptimized
                          className="object-cover"
                        />
                      ) : (
                        <FileText
                          className="m-auto mt-6 text-[#afbdcd]"
                          size={28}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#afbdcd]">
                        {formatDay(item.occurredAt)} ·{" "}
                        {typeMeta(item.type).label}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold group-hover:text-[#8ecfff] sm:text-xl">
                        {item.title}
                      </h2>
                      <p className="mt-2 line-clamp-1 text-sm leading-6 text-[#afbdcd]">
                        {item.summary}
                      </p>
                      <p className="mt-2 text-sm text-[#afbdcd]">
                        {[item.project?.title, item.locationLabel]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {item.skills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.skills.slice(0, 3).map((skill) => (
                            <span
                              key={skill}
                              className="rounded-full border border-[#35506e] px-2 py-1 text-xs text-[#b8c9da]"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                      <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#8f6a28] bg-[#372b16] px-3 py-1 text-xs text-[#f5cc7c]">
                        {item.evidenceStatus === "VERIFIED"
                          ? "Validado"
                          : item.evidenceStatus === "CONFIRMED"
                            ? "Confirmado"
                            : item.evidenceStatus === "LINKED"
                              ? "Vinculado"
                              : "Declarado"}
                      </span>
                    </div>
                    <span className="hidden min-h-11 shrink-0 items-center gap-2 rounded-lg bg-[#2563eb] px-5 text-sm font-semibold sm:inline-flex">
                      <ExternalLink size={17} />
                      Abrir
                    </span>
                  </Link>
                );
              })}
              {!loading && !items.length && !error ? (
                <div className="py-12">
                  <h2 className="text-xl font-semibold">
                    No hay bitácoras para estos filtros
                  </h2>
                  <p className="mt-2 text-[#afbdcd]">
                    Amplía el periodo o limpia los filtros para explorar otros
                    trabajos públicos.
                  </p>
                  <button
                    className={`${button} mt-4`}
                    onClick={() => apply(readPublicArchiveFilters(""))}
                  >
                    Ver todas las bitácoras
                  </button>
                </div>
              ) : null}
            </div>
            {error ? (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-[#79554e] p-4"
              >
                <p>{error}</p>
                <button
                  className={`${button} mt-3`}
                  onClick={() => {
                    if (items.length) void more();
                    else setRetry(retry + 1);
                  }}
                >
                  Reintentar
                </button>
              </div>
            ) : null}
            <div className="mt-5 flex justify-center" aria-live="polite">
              {loading ? (
                <p
                  role="status"
                  className="flex items-center gap-2 text-[#afbdcd]"
                >
                  <LoaderCircle
                    className="animate-spin motion-reduce:animate-none"
                    size={18}
                  />
                  Cargando bitácoras…
                </p>
              ) : cursor ? (
                <button className={button} onClick={() => void more()}>
                  Cargar más bitácoras
                  <ArrowRight size={18} />
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function ActivityDetail({
  record,
  copied,
  onCopy,
}: {
  record: PublicCvActivityRecord;
  copied: boolean;
  onCopy: () => void;
}) {
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState("evidence");
  const images = record.media.filter((media) =>
    media.contentType.startsWith("image/"),
  );
  const fallback = evidenceImage(record);
  const current = images[active]?.href || fallback;
  const status =
    record.evidenceStatus === "VERIFIED"
      ? "Validado"
      : record.evidenceStatus === "CONFIRMED"
        ? "Confirmado"
        : record.evidenceStatus === "LINKED"
          ? "Vinculado"
          : "Declarado";
  const panel = "rounded-xl border border-[#294057] bg-[#0b1b2b]";
  return (
    <article>
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-4xl">
            <h1 className="text-2xl font-semibold leading-tight sm:text-4xl">
              {record.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[#b8c9da]">
              <span className="inline-flex items-center gap-2">
                <CalendarDays size={17} />
                {formatDay(record.occurredAt)} · {formatTime(record.occurredAt)}
              </span>
              {record.locationLabel && (
                <span className="inline-flex items-center gap-2">
                  <MapPin size={17} />
                  {record.locationLabel}
                </span>
              )}
              <span className="rounded-full border border-[#8f6a28] bg-[#372b16] px-3 py-1 text-[#f5cc7c]">
                {status}
              </span>
            </div>
          </div>
          <button
            onClick={onCopy}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#35506e] px-5 text-sm font-semibold"
          >
            <Copy size={17} />
            {copied ? "Enlace copiado" : "Compartir registro"}
          </button>
        </div>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section
          className={`${panel} overflow-hidden p-2`}
          aria-label="Galería de evidencias"
        >
          {current ? (
            <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-[#050d16]">
              <Image
                src={current}
                alt={`${record.title}, evidencia ${active + 1}`}
                fill
                unoptimized
                sizes="(min-width:1024px) 900px,100vw"
                className="object-contain"
              />
            </div>
          ) : (
            <div className="flex aspect-[16/9] flex-col items-center justify-center gap-3 text-[#b8c9da]">
              <FileText size={36} />
              <p>Este registro no incluye imágenes públicas.</p>
            </div>
          )}
          {images.length > 1 && (
            <div
              className="mt-2 flex gap-2 overflow-x-auto pb-1"
              aria-label="Elegir imagen"
            >
              {images.map((media, index) => (
                <button
                  key={media.id}
                  type="button"
                  onClick={() => setActive(index)}
                  aria-label={`Ver evidencia ${index + 1}`}
                  aria-pressed={active === index}
                  className={`relative h-24 min-w-28 flex-1 overflow-hidden rounded-lg border-2 ${active === index ? "border-[#67afff]" : "border-transparent"}`}
                >
                  <Image
                    src={media.href}
                    alt=""
                    fill
                    unoptimized
                    sizes="200px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </section>
        <aside
          className={`${panel} p-5 sm:p-6`}
          aria-label="Resumen del registro"
        >
          <h2 className="text-xl font-semibold">Resumen del registro</h2>
          <dl className="mt-5 divide-y divide-[#294057] border-t border-[#294057]">
            <div className="py-5">
              <dt className="text-sm text-[#b8c9da]">Tipo de trabajo</dt>
              <dd className="mt-2 font-medium">
                {typeMeta(record.type).label}
              </dd>
            </div>
            <div className="py-5">
              <dt className="text-sm text-[#b8c9da]">Resultado declarado</dt>
              <dd className="mt-2 leading-7">
                {record.outcome || "No indicado"}
              </dd>
            </div>
            <div className="py-5">
              <dt className="text-sm text-[#b8c9da]">Trabajo relacionado</dt>
              <dd className="mt-2 leading-7">
                {record.project?.title ||
                  record.workspace ||
                  "Sin trabajo vinculado"}
              </dd>
            </div>
          </dl>
          {record.skills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {record.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-[#35506e] px-3 py-1 text-xs text-[#b8c9da]"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </aside>
      </div>
      <div
        role="tablist"
        aria-label="Información del registro"
        className="mt-7 flex gap-3 border-b border-[#294057]"
      >
        {[
          ["evidence", "Evidencias"],
          ["validation", "Respaldo"],
          ["history", "Historial"],
        ].map(([id, label]) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(event) => {
              const ids = ["evidence", "validation", "history"];
              const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (!offset && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const next = event.key === "Home" ? ids[0] : event.key === "End" ? ids[2] : ids[(ids.indexOf(tab) + offset + ids.length) % ids.length];
              setTab(next);
              document.getElementById(`tab-${next}`)?.focus();
            }}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={`min-h-12 border-b-2 px-4 text-sm font-semibold ${tab === id ? "border-[#539bff] text-white" : "border-transparent text-[#b8c9da]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className={`${panel} mt-4 p-5 sm:p-6`}
      >
        {tab === "evidence" && (
          <>
            <h2 className="text-lg font-semibold">Evidencias del registro</h2>
            <p className="mt-3 max-w-3xl leading-7 text-[#c6d3e1]">
              {record.summary}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {record.media.map((media) => (
                <a
                  key={media.id}
                  href={media.downloadHref}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#35506e] px-4 text-sm"
                >
                  <FileText size={16} />
                  {media.fileName}
                </a>
              ))}
            </div>
            {record.evidenceUrls.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3">
                {record.evidenceUrls.map((url, index) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 text-sm text-[#8ecfff]"
                  >
                    <ExternalLink size={16} />
                    Referencia {index + 1}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
        {tab === "validation" && (
          <>
            <h2 className="text-lg font-semibold">Respaldo del registro</h2>
            {record.validations.length ? (
              record.validations.map((validation) => (
                <div
                  key={validation.id}
                  className="mt-4 border-t border-[#294057] pt-4"
                >
                  <p className="font-medium">
                    {validation.validatorName || "Responsable autorizado"}
                  </p>
                  <p className="mt-1 text-sm text-[#b8c9da]">
                    {formatLongDate(
                      validation.resolvedAt || validation.createdAt,
                    )}
                  </p>
                  {validation.responseNote && (
                    <p className="mt-3 leading-7">{validation.responseNote}</p>
                  )}
                </div>
              ))
            ) : (
              <p className="mt-3 text-[#b8c9da]">
                Este registro no tiene respaldos públicos disponibles. Su estado
                es {status.toLowerCase()}.
              </p>
            )}
          </>
        )}
        {tab === "history" && (
          <>
            <h2 className="text-lg font-semibold">Historial público</h2>
            <p className="mt-3 text-[#b8c9da]">
              Registro creado el {formatLongDate(record.createdAt)},{" "}
              {formatTime(record.createdAt)}.
            </p>
            <p className="mt-3 text-sm text-[#b8c9da]">
              Solo se muestra la información que el profesional ha hecho
              pública.
            </p>
          </>
        )}
      </section>
    </article>
  );
}
