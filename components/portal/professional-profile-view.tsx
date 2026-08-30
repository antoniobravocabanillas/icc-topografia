"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  MapPin,
  MessageSquare,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { FriendButton } from "@/components/terraqo/friend-button";
import { UserAvatar } from "@/components/terraqo/user-avatar";

type Friendship = {
  id?: string | null;
  status: "NONE" | "PENDING_SENT" | "PENDING_RECEIVED" | "ACCEPTED";
};
type Experience = {
  id: string;
  title: string;
  company: string;
  duration: string;
  verified: boolean;
  current: boolean;
  summary?: string | null;
};
type Education = {
  id: string;
  degree: string;
  institution: string;
  field?: string | null;
  verified: boolean;
};
type Worklog = {
  id: string;
  title: string;
  summary: string;
  outcome?: string | null;
  occurredAt: string;
  workspace?: string | null;
  project?: string | null;
  skills: string[];
  mediaIds: string[];
  verified: boolean;
  quality: number;
  reactions: number;
  comments: number;
};
type Connection = {
  id: string;
  name?: string | null;
  image?: string | null;
  profileId?: string | null;
};

export type ProfessionalProfileViewData = {
  profileId: string;
  userId: string;
  owner: boolean;
  name: string;
  image?: string | null;
  headline: string;
  location: string;
  experienceDuration: string;
  online: boolean;
  available: boolean;
  statusLabel: string;
  verified: boolean;
  about: string;
  skills: string[];
  experiences: Experience[];
  education: Education[];
  affiliations: Array<{
    id: string;
    company: string;
    role: string;
    slug: string;
  }>;
  worklogs: Worklog[];
  commonConnections: Connection[];
  friendship: Friendship;
  metrics: {
    experiences: number;
    companies: number;
    validations: number;
    recognitions: number;
  };
};

const tabs = [
  "Resumen",
  "Experiencia",
  "Educación",
  "Validaciones",
  "Bitácora",
  "Actividad",
] as const;
type Tab = (typeof tabs)[number];

export function ProfessionalProfileView({
  profile,
}: {
  profile: ProfessionalProfileViewData;
}) {
  const [tab, setTab] = useState<Tab>("Bitácora");
  const [worklogLimit, setWorklogLimit] = useState(4);
  const [worklogFilter, setWorklogFilter] = useState("all");
  const [selectedWorklog, setSelectedWorklog] = useState<Worklog | null>(null);
  const [messageBusy, setMessageBusy] = useState(false);
  const [messageError, setMessageError] = useState("");

  const filteredWorklogs = useMemo(
    () =>
      profile.worklogs.filter(
        (item) => worklogFilter === "all" || item.verified,
      ),
    [profile.worklogs, worklogFilter],
  );

  async function openConversation() {
    setMessageBusy(true);
    setMessageError("");
    try {
      const response = await fetch("/api/terraqo/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start",
          recipientUserId: profile.userId,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.error?.message || "No pudimos abrir la conversación.",
        );
      window.dispatchEvent(
        new CustomEvent("terraqo:open-messages", {
          detail: { conversationId: payload.data.id },
        }),
      );
    } catch (error) {
      setMessageError(
        error instanceof Error
          ? error.message
          : "No pudimos abrir la conversación.",
      );
    } finally {
      setMessageBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-5 py-5 lg:py-7">
      <nav
        className="flex items-center gap-2 text-xs text-slate-500"
        aria-label="Ruta del perfil"
      >
        <Link href="/red" className="hover:text-[#4374ba]">
          Red profesional
        </Link>
        <span>/</span>
        <span>Perfil profesional</span>
        <span>/</span>
        <button
          onClick={() => setTab("Bitácora")}
          className="hover:text-[#4374ba]"
        >
          Bitácora
        </button>
      </nav>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0 space-y-4">
          <section className="relative overflow-hidden rounded-[24px] border border-[#1f4770] bg-[radial-gradient(circle_at_82%_22%,rgba(65,121,182,.24),transparent_36%),linear-gradient(135deg,#071827,#0c2239_58%,#102d4a)] p-5 text-white shadow-[0_24px_60px_rgba(10,29,48,.18)] sm:p-7">
            <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(89,147,202,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(89,147,202,.1)_1px,transparent_1px)] [background-size:42px_42px]" />
            <div className="relative grid gap-6 lg:grid-cols-[1fr_auto]">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative w-fit">
                  <UserAvatar
                    name={profile.name}
                    image={profile.image}
                    size="xl"
                    className="border-4 border-white/80"
                  />
                  <span
                    className={`absolute bottom-2 right-1 h-4 w-4 rounded-full border-2 border-[#0c2239] ${profile.online ? "bg-emerald-400" : "bg-slate-400"}`}
                  />
                </div>
                <div className="min-w-0">
                  {profile.available ? (
                    <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold text-emerald-200">
                      Disponible para proyectos
                    </span>
                  ) : null}
                  <h1 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-4xl">
                    {profile.name}
                  </h1>
                  <p className="mt-1 text-sm font-semibold text-[#72d9ef]">
                    {profile.headline}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/70">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {profile.location}
                    </span>
                    <span>{profile.experienceDuration} de experiencia</span>
                    <span>
                      {profile.online ? "En línea" : "Fuera de línea"}
                    </span>
                    {profile.verified ? (
                      <span className="inline-flex items-center gap-1 text-[#7de4ff]">
                        <BadgeCheck className="h-4 w-4" />
                        Perfil verificado
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {profile.skills.slice(0, 5).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/85"
                      >
                        {skill}
                      </span>
                    ))}
                    {profile.skills.length > 5 ? (
                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px]">
                        +{profile.skills.length - 5}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              {!profile.owner ? (
                <div className="relative grid min-w-[190px] content-start gap-2">
                  <button
                    onClick={openConversation}
                    disabled={
                      profile.friendship.status !== "ACCEPTED" || messageBusy
                    }
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#10253d] shadow-lg disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {messageBusy ? "Abriendo…" : "Enviar mensaje"}
                  </button>
                  <FriendButton
                    recipientId={profile.userId}
                    initial={profile.friendship}
                  />
                  {messageError ? (
                    <p className="text-xs text-rose-200">{messageError}</p>
                  ) : null}
                </div>
              ) : (
                <Link
                  href="/portal/perfil"
                  className="relative inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-[#10253d]"
                >
                  Editar perfil
                </Link>
              )}
            </div>
            <div className="relative mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
              <Metric
                value={profile.metrics.experiences}
                label="Experiencias"
                icon={BriefcaseBusiness}
              />
              <Metric
                value={profile.metrics.companies}
                label="Empresas"
                icon={Building2}
              />
              <Metric
                value={profile.metrics.validations}
                label="Validaciones"
                icon={ShieldCheck}
              />
              <Metric
                value={profile.metrics.recognitions}
                label="Reconocimientos"
                icon={CheckCircle2}
              />
            </div>
          </section>

          <div className="overflow-x-auto rounded-2xl border bg-white px-2 shadow-sm">
            <div className="flex min-w-max">
              {tabs.map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  className={`relative min-h-12 px-4 text-xs font-bold transition ${tab === item ? "text-[#4374ba]" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {item}
                  {tab === item ? (
                    <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#4374ba]" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {tab === "Bitácora" ? (
            <section className="rounded-[22px] border bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-bold">
                    Bitácora profesional
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Evidencias y resultados que construyen este CV vivo.
                  </p>
                </div>
                <div className="flex gap-2">
                  {profile.owner ? (
                    <Link
                      href="/bitacora"
                      className="inline-flex min-h-10 items-center rounded-xl bg-[#4374ba] px-3 text-xs font-bold text-white"
                    >
                      + Registrar bitácora
                    </Link>
                  ) : null}
                  <label className="relative">
                    <select
                      value={worklogFilter}
                      onChange={(event) => {
                        setWorklogFilter(event.target.value);
                        setWorklogLimit(4);
                      }}
                      className="h-10 appearance-none rounded-xl border bg-white pl-3 pr-8 text-xs font-bold"
                    >
                      <option value="all">Todas</option>
                      <option value="verified">Verificadas</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                  </label>
                </div>
              </div>
              <div className="relative mt-5 space-y-1 before:absolute before:bottom-4 before:left-[92px] before:top-4 before:w-px before:bg-slate-200 sm:before:left-[116px]">
                {filteredWorklogs.slice(0, worklogLimit).map((worklog) => (
                  <WorklogRow
                    key={worklog.id}
                    worklog={worklog}
                    onOpen={() => setSelectedWorklog(worklog)}
                  />
                ))}
              </div>
              {!filteredWorklogs.length ? (
                <Empty
                  icon={BookOpen}
                  text="Este perfil aún no comparte bitácoras con tu nivel de acceso."
                />
              ) : null}
              {worklogLimit < filteredWorklogs.length ? (
                <button
                  onClick={() => setWorklogLimit((value) => value + 4)}
                  className="mx-auto mt-5 flex min-h-10 items-center gap-2 rounded-xl border px-5 text-xs font-bold text-[#4374ba]"
                >
                  Cargar más bitácoras <ChevronDown className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </section>
          ) : null}

          {tab === "Resumen" ? (
            <Section title="Resumen profesional">
              <p className="max-w-3xl whitespace-pre-line text-sm leading-7 text-slate-600">
                {profile.about}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {profile.affiliations.map((item) => (
                  <Link
                    key={item.id}
                    href={`/empresas/${item.slug}`}
                    className="rounded-2xl border p-4 transition hover:border-[#4374ba]/40"
                  >
                    <Building2 className="h-5 w-5 text-[#4374ba]" />
                    <b className="mt-3 block text-sm">{item.company}</b>
                    <span className="text-xs text-slate-500">{item.role}</span>
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}
          {tab === "Experiencia" ? (
            <Section title="Experiencia">
              <div className="space-y-3">
                {profile.experiences.map((item) => (
                  <ExperienceItem key={item.id} item={item} />
                ))}
                {!profile.experiences.length ? (
                  <Empty
                    icon={BriefcaseBusiness}
                    text="No hay experiencias visibles."
                  />
                ) : null}
              </div>
            </Section>
          ) : null}
          {tab === "Educación" ? (
            <Section title="Educación y certificaciones">
              <div className="grid gap-3 sm:grid-cols-2">
                {profile.education.map((item) => (
                  <article key={item.id} className="rounded-2xl border p-4">
                    <FileCheck2 className="h-5 w-5 text-[#4374ba]" />
                    <b className="mt-3 block text-sm">{item.degree}</b>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.institution}
                      {item.field ? ` · ${item.field}` : ""}
                    </p>
                    {item.verified ? (
                      <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        Verificada
                      </span>
                    ) : null}
                  </article>
                ))}
                {!profile.education.length ? (
                  <Empty icon={BookOpen} text="No hay formación visible." />
                ) : null}
              </div>
            </Section>
          ) : null}
          {tab === "Validaciones" ? (
            <Section title="Validaciones">
              <div className="grid gap-3 sm:grid-cols-3">
                <InfoCard
                  title="Identidad"
                  value={profile.verified ? "Verificada" : "Pendiente"}
                />
                <InfoCard
                  title="Evidencias verificadas"
                  value={String(profile.metrics.validations)}
                />
                <InfoCard
                  title="Calidad documentada"
                  value={`${Math.round(profile.worklogs.reduce((sum, item) => sum + item.quality, 0) / Math.max(1, profile.worklogs.length))}%`}
                />
              </div>
            </Section>
          ) : null}
          {tab === "Actividad" ? (
            <Section title="Actividad reciente">
              <div className="space-y-3">
                {profile.worklogs.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedWorklog(item)}
                    className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left hover:bg-slate-50"
                  >
                    <Clock3 className="h-5 w-5 text-[#4374ba]" />
                    <span>
                      <b className="block text-sm">Publicó: {item.title}</b>
                      <small className="text-slate-500">
                        {formatDate(item.occurredAt)}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          ) : null}
        </main>

        <aside className="space-y-4">
          <SideCard title="Disponibilidad" icon={Clock3}>
            <div className="flex items-start gap-2">
              <span
                className={`mt-1 h-2.5 w-2.5 rounded-full ${profile.available ? "bg-emerald-500" : "bg-slate-400"}`}
              />
              <span>
                <b className="block text-sm">{profile.statusLabel}</b>
                <small className="text-slate-500">
                  Consulta disponibilidad por mensaje
                </small>
              </span>
            </div>
          </SideCard>
          <SideCard title="Sobre mí">
            <p className="line-clamp-6 text-xs leading-6 text-slate-600">
              {profile.about}
            </p>
            <button
              onClick={() => setTab("Resumen")}
              className="mt-3 text-xs font-bold text-[#4374ba]"
            >
              Ver más
            </button>
          </SideCard>
          <SideCard title="Habilidades principales">
            <div className="flex flex-wrap gap-1.5">
              {profile.skills.slice(0, 8).map((skill) => (
                <span
                  key={skill}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold"
                >
                  {skill}
                </span>
              ))}
            </div>
            <button
              onClick={() => setTab("Resumen")}
              className="mt-3 text-xs font-bold text-[#4374ba]"
            >
              Ver habilidades
            </button>
          </SideCard>
          <SideCard title="Conexiones en común" icon={UsersRound}>
            {profile.commonConnections.length ? (
              <>
                <div className="flex -space-x-2">
                  {profile.commonConnections.slice(0, 6).map((person) => (
                    <Link
                      key={person.id}
                      href={
                        person.profileId
                          ? `/profesionales/${person.profileId}`
                          : "/amigos"
                      }
                      title={person.name || "Conexión"}
                    >
                      <UserAvatar
                        name={person.name}
                        image={person.image}
                        size="sm"
                        className="border-2 border-white"
                      />
                    </Link>
                  ))}
                </div>
                <Link
                  href="/amigos"
                  className="mt-3 inline-flex text-xs font-bold text-[#4374ba]"
                >
                  Ver conexiones
                </Link>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Aún no tienen conexiones en común.
              </p>
            )}
          </SideCard>
          {profile.verified ? (
            <SideCard title="Perfil verificado" icon={ShieldCheck}>
              <p className="text-xs leading-5 text-slate-500">
                La identidad de este profesional fue revisada dentro del flujo
                de validación de Terraqo.
              </p>
              <button
                onClick={() => setTab("Validaciones")}
                className="mt-3 text-xs font-bold text-[#4374ba]"
              >
                Ver validaciones
              </button>
            </SideCard>
          ) : null}
        </aside>
      </div>

      {selectedWorklog ? (
        <WorklogModal
          worklog={selectedWorklog}
          onClose={() => setSelectedWorklog(null)}
        />
      ) : null}
    </div>
  );
}

function Metric({
  value,
  label,
  icon: Icon,
}: {
  value: number;
  label: string;
  icon: typeof BriefcaseBusiness;
}) {
  return (
    <div className="bg-[#0b2238]/70 p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-[#72d9ef]" />
      <b className="mt-1 block text-lg">{value}</b>
      <span className="text-[10px] text-white/60">{label}</span>
    </div>
  );
}
function SideCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof Clock3;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] border bg-white p-4 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
        {Icon ? <Icon className="h-4 w-4 text-[#4374ba]" /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] border bg-white p-5 shadow-sm">
      <h2 className="mb-5 font-display text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
function Empty({ icon: Icon, text }: { icon: typeof BookOpen; text: string }) {
  return (
    <div className="col-span-full grid place-items-center rounded-2xl border border-dashed p-8 text-center">
      <Icon className="h-6 w-6 text-slate-300" />
      <p className="mt-2 text-xs text-slate-500">{text}</p>
    </div>
  );
}
function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-slate-50 p-4">
      <span className="text-xs text-slate-500">{title}</span>
      <b className="mt-2 block text-lg">{value}</b>
    </div>
  );
}
function ExperienceItem({ item }: { item: Experience }) {
  return (
    <article className="rounded-2xl border p-4">
      <div className="flex justify-between gap-3">
        <div>
          <b className="text-sm">{item.title}</b>
          <p className="mt-1 text-xs text-slate-500">
            {item.company} · {item.duration}
            {item.current ? " · Actualmente" : ""}
          </p>
        </div>
        {item.verified ? (
          <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-600" />
        ) : null}
      </div>
      {item.summary ? (
        <p className="mt-3 text-xs leading-6 text-slate-600">{item.summary}</p>
      ) : null}
    </article>
  );
}
function WorklogRow({
  worklog,
  onOpen,
}: {
  worklog: Worklog;
  onOpen: () => void;
}) {
  return (
    <article className="relative grid grid-cols-[76px_1fr] gap-4 py-3 sm:grid-cols-[100px_84px_1fr_auto]">
      <time className="pt-2 text-right text-[10px] font-semibold leading-4 text-slate-500">
        {formatDate(worklog.occurredAt)}
        <br />
        {formatTime(worklog.occurredAt)}
      </time>
      <span
        className={`absolute left-[88px] top-6 h-2.5 w-2.5 rounded-full ring-4 ring-white sm:left-[112px] ${worklog.verified ? "bg-emerald-500" : "bg-[#4374ba]"}`}
      />
      {worklog.mediaIds[0] ? (
        <img
          src={`/api/terraqo/worklog/evidence/${worklog.mediaIds[0]}`}
          alt=""
          className="hidden h-16 w-20 rounded-xl object-cover sm:block"
        />
      ) : (
        <div className="hidden h-16 w-20 place-items-center rounded-xl bg-slate-100 sm:grid">
          <BookOpen className="h-5 w-5 text-slate-400" />
        </div>
      )}
      <div className="min-w-0">
        <b className="block truncate text-sm">{worklog.title}</b>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
          {worklog.summary}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-slate-500">
          {worklog.workspace ? <span>{worklog.workspace}</span> : null}
          {worklog.project ? <span>· {worklog.project}</span> : null}
          {worklog.verified ? (
            <span className="text-emerald-700">· Verificada</span>
          ) : null}
        </div>
      </div>
      <button
        onClick={onOpen}
        className="col-start-2 mt-1 h-9 rounded-xl border px-3 text-[10px] font-bold text-[#315f9f] sm:col-start-auto sm:mt-0"
      >
        Ver detalle
      </button>
    </article>
  );
}
function WorklogModal({
  worklog,
  onClose,
}: {
  worklog: Worklog;
  onClose: () => void;
}) {
  const [media, setMedia] = useState(0);
  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-[#071522]/70 p-3 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <article className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-[24px] bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 p-4 backdrop-blur">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#4374ba]">
              Bitácora profesional
            </span>
            <h2 className="mt-1 font-display text-xl font-bold">
              {worklog.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl border"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {worklog.mediaIds.length ? (
          <div className="relative bg-slate-950">
            <img
              src={`/api/terraqo/worklog/evidence/${worklog.mediaIds[media]}`}
              alt={`Evidencia ${media + 1}`}
              className="max-h-[52dvh] w-full object-contain"
            />
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1">
              {worklog.mediaIds.map((id, index) => (
                <button
                  key={id}
                  onClick={() => setMedia(index)}
                  className={`h-1.5 rounded-full transition-all ${media === index ? "w-7 bg-white" : "w-2 bg-white/50"}`}
                  aria-label={`Ver evidencia ${index + 1}`}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div className="p-5">
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(worklog.occurredAt)}
            </span>
            {worklog.workspace ? <span>· {worklog.workspace}</span> : null}
            {worklog.project ? <span>· {worklog.project}</span> : null}
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            {worklog.summary}
          </p>
          {worklog.outcome ? (
            <div className="mt-4 rounded-2xl border-l-4 border-[#20a9bd] bg-[#eaf7f8] p-4 text-sm leading-6">
              <b>Resultado:</b> {worklog.outcome}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {worklog.skills.map((skill) => (
              <span
                key={skill}
                className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold"
              >
                {skill}
              </span>
            ))}
          </div>
          <div className="mt-5 flex gap-4 border-t pt-4 text-xs text-slate-500">
            <span>{worklog.reactions} reconocimientos</span>
            <span>{worklog.comments} comentarios</span>
            <span>{worklog.quality}% calidad</span>
          </div>
        </div>
      </article>
    </div>
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
