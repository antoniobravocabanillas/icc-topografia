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
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderKanban,
  ImageIcon,
  Lightbulb,
  LoaderCircle,
  MapPin,
  Milestone,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EvidenceGallery } from "@/components/terraqo/evidence-gallery";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
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
    if (!dialogOpen) return;
    const controller = new AbortController();
    setCalendarBusy(true);
    setCalendarError(null);
    setDays({});
    const params = publicArchiveApiQuery(draft);
    params.set("month", month);
    params.delete("from");
    params.delete("to");
    params.delete("period");
    void fetch(
      `/api/v1/profiles/${encodeURIComponent(profileId)}/evidence/activity?${params}`,
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
  }, [dialogOpen, month, draft, profileId]);

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
    dialog.current?.close();
    setDialogOpen(false);
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
    if (key === "from") return `Desde ${value}`;
    if (key === "to") return `Hasta ${value}`;
    return value;
  }
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Lima",
  }).format(new Date());
  return (
    <main className="min-h-screen bg-[#07111e] text-[#f4f7fb]">
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-10">
        <Link
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
          href={detailId ? archiveHref : `/cv/${encodeURIComponent(username)}`}
          className={button}
        >
          <ArrowLeft size={18} />
          {detailId ? "Volver a las bitácoras" : "Volver al CV"}
        </Link>
        {detailId ? (
          <div className="mx-auto mt-6 max-w-4xl">
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
                  Bitácoras públicas
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
              <div className="flex gap-2">
                <button type="submit" className={`${button} bg-[#255a97]`}>
                  <Search size={18} />
                  Buscar
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    setDialogOpen(true);
                    dialog.current?.showModal();
                  }}
                >
                  <CalendarDays size={18} />
                  Fechas y filtros
                </button>
              </div>
            </form>
            <div className="my-4 flex flex-wrap items-center gap-2 text-sm text-[#afbdcd]">
              <span>Más recientes primero · Hora de Perú</span>
              {archiveFilterKeys
                .filter((key) => filters[key])
                .map((key) => (
                  <button
                    className={button}
                    key={key}
                    onClick={() => apply({ ...filters, [key]: "" })}
                    aria-label={`Quitar filtro: ${filterLabel(key)}`}
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
            <div
              aria-busy={loading}
              className="divide-y divide-[#294057] border-y border-[#294057]"
            >
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
                    className="group flex items-start gap-4 py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7fa8ff] sm:gap-6"
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#101d2d] sm:h-28 sm:w-40">
                      {thumbnail ? (
                        <Image
                          src={`/api/public/cv/${encodeURIComponent(username)}/worklogs/${encodeURIComponent(thumbnail.id)}`}
                          alt=""
                          fill
                          sizes="(max-width:640px) 80px,160px"
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
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#afbdcd]">
                        {item.summary}
                      </p>
                      <p className="mt-2 text-sm text-[#afbdcd]">
                        {[item.project?.title, item.locationLabel]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <span className="mt-2 inline-block text-sm text-[#8ecfff]">
                        {item.evidenceStatus === "VERIFIED"
                          ? "Validado"
                          : item.evidenceStatus === "CONFIRMED"
                            ? "Confirmado"
                            : item.evidenceStatus === "LINKED"
                              ? "Vinculado"
                              : "Declarado"}
                      </span>
                    </div>
                    <ArrowRight
                      className="mt-2 hidden shrink-0 text-[#8ecfff] sm:block"
                      size={20}
                    />
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
      <dialog
        style={{ colorScheme: "dark" }}
        ref={dialog}
        aria-labelledby="archive-filters-title"
        onClose={() => setDialogOpen(false)}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-auto rounded-t-2xl border border-[#294057] bg-[#101d2d] p-5 text-[#f4f7fb] backdrop:bg-black/60 sm:inset-0 sm:m-auto sm:max-w-xl sm:rounded-2xl sm:p-7"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply(draft);
          }}
        >
          <div className="sticky top-0 z-10 mb-5 flex items-center justify-between gap-3 bg-[#101d2d] py-2">
            <h2 id="archive-filters-title" className="text-2xl font-bold">
              Fechas y filtros
            </h2>
            <button
              type="button"
              className={button}
              onClick={() => dialog.current?.close()}
            >
              Cerrar
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Tipo
              <select
                aria-label="Tipo"
                className={`${control} mt-2`}
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
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
                onChange={(e) => setDraft({ ...draft, state: e.target.value })}
              >
                <option value="">Todos los estados</option>
                <option value="DECLARED">Declarado</option>
                <option value="LINKED">Vinculado</option>
                <option value="CONFIRMED">Confirmado</option>
                <option value="VERIFIED">Validado</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
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
                  <option value={draft.projectId}>Proyecto seleccionado</option>
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
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Hasta
              <input
                className={`${control} mt-2`}
                type="date"
                min={draft.from || undefined}
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </label>
          </div>
          <div className="mt-5 border-t border-[#294057] pt-5">
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
              Cada punto indica trabajo público registrado. Selecciona un día o
              escribe un rango.
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
                    onClick={() => setDraft({ ...draft, from: date, to: date })}
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
          <div className="sticky bottom-0 mt-5 flex flex-wrap gap-3 bg-[#101d2d] py-3">
            <button type="submit" className={`${button} flex-1 bg-[#255a97]`}>
              Aplicar filtros
            </button>
            <button
              type="button"
              className={button}
              onClick={() => setDraft(readPublicArchiveFilters(""))}
            >
              Limpiar
            </button>
          </div>
        </form>
      </dialog>
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
  const meta = typeMeta(record.type);
  const Icon = meta.icon;
  const validation = record.validations[0] || null;
  const validated = Boolean(validation) || record.evidenceStatus === "VERIFIED";
  const image = evidenceImage(record);
  const galleryItems = record.media
    .filter((media) => media.contentType.startsWith("image/"))
    .map((media, index) => ({
      id: media.id,
      src: media.href,
      downloadHref: media.downloadHref,
      alt: `${record.title}, evidencia ${index + 1}`,
    }));

  return (
    <article className="overflow-hidden rounded-2xl border border-[#28425e] bg-[linear-gradient(150deg,rgba(15,31,52,0.98),rgba(7,17,31,0.98))] shadow-[0_30px_80px_rgba(0,0,0,0.32)]">
      <header className="border-b border-[#243b55] p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] ${meta.tone}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </span>
            <h1 className="mt-4 font-display text-2xl font-black leading-tight sm:text-3xl">
              {record.title}
            </h1>
            <p className="mt-2 text-sm text-[#91a5b9]">
              Registro generado el {formatLongDate(record.createdAt)},{" "}
              {formatTime(record.createdAt)}.
            </p>
          </div>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#35506e] px-4 py-2.5 text-xs font-black text-[#dbe6f2] transition hover:border-[#488ac9] hover:bg-[#4374ba]/15"
          >
            <Copy className="h-4 w-4" />{" "}
            {copied ? "Enlace copiado" : "Compartir registro"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black ${validated ? "bg-[#143e36] text-[#6be0b2]" : "bg-[#4a3519] text-[#f5c36f]"}`}
          >
            {validated ? (
              <BadgeCheck className="h-3.5 w-3.5" />
            ) : (
              <Clock3 className="h-3.5 w-3.5" />
            )}
            {validated ? "Validado" : "Declarado"}
          </span>
          <span className="rounded-full border border-[#304963] px-3 py-1 text-[11px] font-black text-[#aebed0]">
            Público
          </span>
        </div>
      </header>

      <div className="p-5 sm:p-7">
        <section>
          <h3 className="font-mono text-xs font-black uppercase tracking-[0.16em] text-[#7fa8ff]">
            Resumen del registro
          </h3>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-5 border-y border-[#243b55] py-5">
            <DetailMetric
              icon={CalendarDays}
              label="Fecha"
              value={formatDay(record.occurredAt)}
            />
            <DetailMetric
              icon={Clock3}
              label="Hora"
              value={formatTime(record.occurredAt)}
            />
            <DetailMetric
              icon={ShieldCheck}
              label="Estado"
              value={validated ? "Validado" : "Declarado"}
              accent={validated}
            />
            {record.project ? (
              <DetailMetric
                icon={FolderKanban}
                label="Proyecto"
                value={record.project.title}
              />
            ) : null}
            {record.locationLabel ? (
              <DetailMetric
                icon={MapPin}
                label="Lugar"
                value={record.locationLabel}
              />
            ) : null}
          </div>
          {record.locationLabel ? (
            <p className="mt-2 text-right text-[10px] font-medium text-[#60778e]">
              Ubicación aproximada · © OpenStreetMap contributors
            </p>
          ) : null}
        </section>

        <section className="mt-7">
          <h3 className="font-mono text-xs font-black uppercase tracking-[0.16em] text-[#7fa8ff]">
            Detalle profesional
          </h3>
          <p className="mt-4 text-[15px] leading-7 text-[#d7e1ec]">
            {record.summary}
          </p>
          {record.outcome ? (
            <div className="mt-5 border-l-2 border-[#25c0d5] bg-[#0d2533] px-5 py-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#25c0d5]">
                Resultado registrado
              </p>
              <p className="mt-2 text-sm leading-6 text-[#c5d2df]">
                {record.outcome}
              </p>
            </div>
          ) : null}
        </section>

        {record.project || record.workspace ? (
          <section className="mt-7 border-y border-[#243b55] py-5">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#4374ba]/15 text-[#7fa8ff]">
                <BriefcaseBusiness className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#71869b]">
                  Contexto del trabajo
                </p>
                <h3 className="mt-1 text-base font-black">
                  {record.project?.title || record.workspace}
                </h3>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#91a5b9]">
                  {record.project?.clientName ? (
                    <span>{record.project.clientName}</span>
                  ) : null}
                  {record.project?.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {record.project.location}
                    </span>
                  ) : null}
                  {record.project?.category ? (
                    <span>{record.project.category}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-7">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-mono text-xs font-black uppercase tracking-[0.16em] text-[#7fa8ff]">
              Evidencia pública
            </h3>
            {galleryItems.length > 1 ? (
              <span className="text-xs font-bold text-[#91a5b9]">
                {galleryItems.length} imágenes
              </span>
            ) : null}
          </div>
          {galleryItems.length ? (
            <EvidenceGallery
              items={galleryItems}
              tone="dark"
              className="mt-4"
            />
          ) : image ? (
            <a
              href={image}
              target="_blank"
              rel="noreferrer"
              className="group relative mt-4 block aspect-[16/10] overflow-hidden rounded-xl border border-[#2a4561] bg-[#0e1a26]"
            >
              <Image
                src={image}
                alt={`Evidencia de ${record.title}`}
                fill
                sizes="(max-width: 1280px) 100vw, 680px"
                unoptimized
                className="object-cover transition duration-500 group-hover:scale-[1.015]"
              />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-[#07111f]/85 px-3 py-2 text-xs font-black backdrop-blur">
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir evidencia
              </span>
            </a>
          ) : (
            <div className="mt-4 flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-[#304963] bg-[#0e1a26]/55 px-8 text-center">
              <div>
                <ImageIcon className="mx-auto h-8 w-8 text-[#597087]" />
                <p className="mt-3 text-sm font-black">
                  Registro documentado sin imagen pública
                </p>
                <p className="mt-1 text-xs leading-5 text-[#71869b]">
                  El detalle profesional y su estado de revisión permanecen
                  visibles.
                </p>
              </div>
            </div>
          )}
          {record.evidenceUrls.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {record.evidenceUrls.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#304963] px-3 py-2 text-xs font-bold text-[#aebed0] hover:border-[#488ac9] hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Referencia {index + 1}
                </a>
              ))}
            </div>
          ) : null}
        </section>

        {record.skills.length ? (
          <section className="mt-7">
            <h3 className="font-mono text-xs font-black uppercase tracking-[0.16em] text-[#7fa8ff]">
              Capacidades vinculadas
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {record.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-[#2e4660] bg-[#102238] px-3 py-1.5 text-xs font-bold text-[#bdcada]"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {validation ? (
          <section className="mt-7 rounded-xl border border-[#285366] bg-[#0b2731] p-5">
            <div className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25c0d5]/12 text-[#25c0d5]">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="font-black text-[#e7f6f5]">
                  Validación profesional
                </p>
                <p className="mt-1 text-xs text-[#8eabb4]">
                  {validation.validatorName
                    ? `Revisado por ${validation.validatorName}`
                    : "Revisado por un responsable autorizado"}{" "}
                  ·{" "}
                  {formatLongDate(
                    validation.resolvedAt || validation.createdAt,
                  )}
                </p>
                {validation.responseNote ? (
                  <p className="mt-3 text-sm leading-6 text-[#bfd0d5]">
                    {validation.responseNote}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <p className="mt-6 flex items-start gap-2 border-t border-[#243b55] pt-5 text-xs leading-5 text-[#71869b]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          Este registro forma parte de la actividad pública seleccionada por el
          profesional. Terraqo distingue entre información declarada y contenido
          validado.
        </p>
      </div>
    </article>
  );
}

function DetailMetric({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-[128px] items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#7fa8ff]" />
      <div>
        <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[#71869b]">
          {label}
        </span>
        <strong
          className={`mt-1 block text-xs ${accent ? "text-[#57d9a6]" : "text-[#dbe6f2]"}`}
        >
          {value}
        </strong>
      </div>
    </div>
  );
}
