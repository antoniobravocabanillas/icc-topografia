"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Bug,
  Building2,
  CalendarDays,
  ChevronDown,
  FolderKanban,
  Gift,
  Grid2X2,
  Heart,
  Lightbulb,
  List,
  MapPin,
  MessageCircle,
  MessageSquare,
  Plus,
  Rocket,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { UserAvatar } from "@/components/terraqo/user-avatar";
import { FriendButton } from "@/components/terraqo/friend-button";

type DirectoryMode = "professionals" | "companies" | "groups";
type ViewMode = "grid" | "list";
type StoryWorklog = {
  id: string;
  title: string;
  summary: string;
  outcome?: string | null;
  type: string;
  evidenceStatus: string;
  moderationStatus: string;
  tqPointsAwarded: number;
  trustScoreAwarded: number;
  skills: string[];
  occurredAt: string;
  workspaceName?: string | null;
  projectName?: string | null;
  mediaIds: string[];
  reactions: number;
  comments: number;
};
type ProfessionalItem = {
  id: string;
  userId: string;
  friendship?: {
    id?: string | null;
    status?: "NONE" | "PENDING_SENT" | "PENDING_RECEIVED" | "ACCEPTED";
  };
  name: string;
  image?: string | null;
  headline?: string | null;
  roleTitle?: string | null;
  city?: string | null;
  locationCity?: string | null;
  status: string;
  verified: boolean;
  workspaceName: string;
  skills: string[];
  visibleExperiences: number;
  verifiedExperiences: number;
  lastSeenAt?: string | null;
  onlineUntil?: string | null;
  profileBoostUntil?: string | null;
  foundingBuilder?: boolean;
  latestWorklog?: StoryWorklog | null;
  updatedAt: string;
};
type CompanyItem = {
  id: string;
  name: string;
  document?: string | null;
  city?: string | null;
  industry?: string | null;
  status: string;
  publicSlug?: string | null;
  logoUrl?: string | null;
  updatedAt: string;
};
type GroupItem = {
  id: string;
  name: string;
  purpose: string;
  workspaceName: string;
  members: number;
  updatedAt: string;
};
type JobAd = {
  id: string;
  title: string;
  summary: string;
  company: string;
  companySlug: string;
  companyLogo?: string | null;
  location?: string | null;
  modality?: string | null;
  skills: string[];
  publishedAt: string;
};
type DirectoryProps = {
  initialQuery?: string;
  jobAds: JobAd[];
  professionals: ProfessionalItem[];
  companies: CompanyItem[];
  groups: GroupItem[];
};

const tabs = [
  { value: "professionals" as const, label: "Profesionales", icon: UsersRound },
  { value: "companies" as const, label: "Empresas", icon: Building2 },
  { value: "groups" as const, label: "Equipos", icon: UserPlus },
];

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function ProfessionalNetworkDirectory({
  initialQuery = "",
  jobAds,
  professionals,
  companies,
  groups,
}: DirectoryProps) {
  const [mode, setMode] = useState<DirectoryMode>("professionals");
  const [view, setView] = useState<ViewMode>("grid");
  const query = initialQuery;
  const [sort, setSort] = useState("relevant");
  const [location, setLocation] = useState("all");
  const [specialty, setSpecialty] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const locationOptions = useMemo(
    () =>
      Array.from(
        new Set(
          professionals
            .map((item) => item.locationCity || item.city)
            .filter(Boolean) as string[],
        ),
      ).sort(),
    [professionals],
  );
  const specialtyOptions = useMemo(
    () =>
      Array.from(
        new Set(professionals.flatMap((item) => item.skills).filter(Boolean)),
      ).sort(),
    [professionals],
  );
  const activeFilterCount =
    Number(location !== "all") +
    Number(specialty !== "all") +
    Number(availability !== "all");

  const visibleProfessionals = useMemo(() => {
    const needle = normalized(query);
    return professionals
      .filter((item) => {
        const haystack = normalized(
          [
            item.name,
            item.headline,
            item.roleTitle,
            item.workspaceName,
            item.city,
            item.locationCity,
            ...item.skills,
          ]
            .filter(Boolean)
            .join(" "),
        );
        if (needle && !haystack.includes(needle)) return false;
        if (location !== "all" && (item.locationCity || item.city) !== location)
          return false;
        if (specialty !== "all" && !item.skills.includes(specialty))
          return false;
        if (
          availability === "available" &&
          !["AVAILABLE", "OPEN_TO_PROJECTS"].includes(item.status)
        )
          return false;
        if (
          availability === "online" &&
          (!item.onlineUntil || Date.parse(item.onlineUntil) <= Date.now())
        )
          return false;
        if (availability === "verified" && !item.verified) return false;
        return true;
      })
      .sort((left, right) => {
        if (sort === "recent")
          return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        if (sort === "available")
          return (
            Number(["AVAILABLE", "OPEN_TO_PROJECTS"].includes(right.status)) -
            Number(["AVAILABLE", "OPEN_TO_PROJECTS"].includes(left.status))
          );
        const rightBoosted = Boolean(
          right.profileBoostUntil &&
          Date.parse(right.profileBoostUntil) > Date.now(),
        );
        const leftBoosted = Boolean(
          left.profileBoostUntil &&
          Date.parse(left.profileBoostUntil) > Date.now(),
        );
        return (
          Number(rightBoosted) - Number(leftBoosted) ||
          Number(right.verified) - Number(left.verified) ||
          right.verifiedExperiences - left.verifiedExperiences ||
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        );
      });
  }, [availability, location, professionals, query, sort, specialty]);

  const visibleCompanies = useMemo(() => {
    const needle = normalized(query);
    return companies
      .filter(
        (item) =>
          !needle ||
          normalized(
            [item.name, item.document, item.city, item.industry, item.status]
              .filter(Boolean)
              .join(" "),
          ).includes(needle),
      )
      .sort((left, right) =>
        sort === "recent"
          ? Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
          : left.name.localeCompare(right.name, "es"),
      );
  }, [companies, query, sort]);
  const visibleGroups = useMemo(() => {
    const needle = normalized(query);
    return groups
      .filter(
        (item) =>
          !needle ||
          normalized(
            [item.name, item.purpose, item.workspaceName].join(" "),
          ).includes(needle),
      )
      .sort((left, right) =>
        sort === "recent"
          ? Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
          : right.members - left.members,
      );
  }, [groups, query, sort]);
  const count =
    mode === "professionals"
      ? visibleProfessionals.length
      : mode === "companies"
        ? visibleCompanies.length
        : visibleGroups.length;
  const totalLabel =
    mode === "professionals"
      ? "profesionales conectados"
      : mode === "companies"
        ? "empresas en tu red"
        : "equipos disponibles";
  function clearFilters() {
    setLocation("all");
    setSpecialty("all");
    setAvailability("all");
  }

  return (
    <div className="min-w-0 pb-12 pt-5 lg:pt-8">
      <JobHero jobs={jobAds} />
      <NetworkStories professionals={professionals} companies={companies} />

      <section
        id="directorio-red"
        className="sticky top-[72px] z-20 -mx-2 mt-5 scroll-mt-24 rounded-2xl border border-[#d7e3e8] bg-white/95 p-2 shadow-[0_14px_40px_rgba(11,35,48,0.08)] backdrop-blur-xl sm:mx-0 sm:p-3"
      >
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="grid min-w-[300px] flex-1 grid-cols-3 rounded-xl border border-[#d7e3e8] bg-white p-1 lg:max-w-[470px]">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = mode === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setMode(tab.value)}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-2 text-xs font-bold transition sm:text-sm ${active ? "bg-[linear-gradient(135deg,#087d79,#0aa19a)] text-white shadow-[0_8px_20px_rgba(8,125,121,0.2)]" : "text-[#526878] hover:bg-[#edf6f6]"}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <label className="relative">
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="h-10 appearance-none rounded-xl border border-[#d7e3e8] bg-white pl-3 pr-9 text-xs font-bold text-[#354c5d] outline-none sm:text-sm"
              >
                <option value="relevant">Más relevantes</option>
                <option value="available">Disponibles primero</option>
                <option value="recent">Más recientes</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667b89]" />
            </label>
            <div className="hidden rounded-xl border border-[#d7e3e8] bg-white p-1 sm:flex">
              <ViewButton
                active={view === "grid"}
                onClick={() => setView("grid")}
                label="Vista en cuadrícula"
              >
                <Grid2X2 className="h-4 w-4" />
              </ViewButton>
              <ViewButton
                active={view === "list"}
                onClick={() => setView("list")}
                label="Vista en lista"
              >
                <List className="h-4 w-4" />
              </ViewButton>
            </div>
            {mode === "professionals" ? (
              <button
                type="button"
                onClick={() => setFiltersOpen((value) => !value)}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition sm:text-sm ${filtersOpen || activeFilterCount ? "border-[#0b8e88] bg-[#e9f7f6] text-[#087d79]" : "border-[#d7e3e8] bg-white text-[#354c5d]"}`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filtros
                {activeFilterCount ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#087d79] px-1 text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mt-5 flex flex-col gap-4">
        <p className="text-sm text-[#526878]">
          <strong className="text-lg text-[#102535]">{count}</strong>{" "}
          {totalLabel}
        </p>
        {mode === "professionals" && (filtersOpen || activeFilterCount) ? (
          <div className="grid gap-3 rounded-2xl border border-[#d7e3e8] bg-[#f8fbfb] p-4 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <FilterSelect
              label="Ubicación"
              value={location}
              onChange={setLocation}
              options={[
                { value: "all", label: "Todas" },
                ...locationOptions.map((item) => ({
                  value: item,
                  label: item,
                })),
              ]}
            />
            <FilterSelect
              label="Especialidad"
              value={specialty}
              onChange={setSpecialty}
              options={[
                { value: "all", label: "Todas" },
                ...specialtyOptions.map((item) => ({
                  value: item,
                  label: item,
                })),
              ]}
            />
            <FilterSelect
              label="Disponibilidad"
              value={availability}
              onChange={setAvailability}
              options={[
                { value: "all", label: "Todas" },
                { value: "available", label: "Disponible para proyectos" },
                { value: "online", label: "En línea ahora" },
                { value: "verified", label: "Identidad verificada" },
              ]}
            />
            <button
              type="button"
              onClick={clearFilters}
              disabled={!activeFilterCount}
              className="h-11 rounded-xl px-4 text-sm font-bold text-[#087d79] disabled:opacity-40"
            >
              Limpiar filtros
            </button>
          </div>
        ) : null}
        {mode === "professionals" ? (
          <ProfessionalsList items={visibleProfessionals} view={view} />
        ) : null}
        {mode === "companies" ? (
          <CompaniesList items={visibleCompanies} view={view} />
        ) : null}
        {mode === "groups" ? (
          <GroupsList items={visibleGroups} view={view} />
        ) : null}
      </div>
    </div>
  );
}

function JobHero({ jobs }: { jobs: JobAd[] }) {
  return jobs.length ? <JobAdsHero jobs={jobs} /> : <BetaCommunityHero />;
}

function JobAdsHero({ jobs }: { jobs: JobAd[] }) {
  const [active, setActive] = useState(0);
  const total = Math.max(jobs.length, 1);
  useEffect(() => {
    if (jobs.length < 2) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % jobs.length),
      7000,
    );
    return () => window.clearInterval(timer);
  }, [jobs.length]);
  useEffect(() => {
    if (active >= jobs.length && jobs.length) setActive(0);
  }, [active, jobs.length]);
  const job = jobs[active];
  const previous = () => setActive((current) => (current - 1 + total) % total);
  const next = () => setActive((current) => (current + 1) % total);

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Oportunidades destacadas"
      className="relative min-h-[330px] overflow-hidden rounded-[26px] border border-[#4374ba]/20 bg-[linear-gradient(116deg,#fafcff_0%,#f0f5fb_56%,#e9f6fa_100%)] px-5 py-7 sm:px-8 lg:min-h-[350px] lg:px-10 lg:py-9"
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[46%] bg-[radial-gradient(circle_at_70%_45%,rgba(37,192,213,0.18),transparent_61%)]" />
      <div className="pointer-events-none absolute -bottom-24 right-[8%] h-64 w-64 rotate-12 rounded-[32%] bg-[linear-gradient(145deg,rgba(72,138,201,0.12),rgba(37,192,213,0.1))] blur-2xl" />
      <div className="relative grid min-h-[270px] gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)] lg:items-center">
        <div className="max-w-3xl">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#4374ba]">
            Oportunidad destacada
          </p>
          <h1 className="mt-3 font-display text-[clamp(2rem,4vw,3.55rem)] font-bold leading-[1.04] tracking-[-0.035em] text-[#0e1a26]">
            {job.title}
          </h1>
          <>
            <p className="mt-3 text-sm font-bold text-[#4374ba]">
              {job.company}
            </p>
            <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-6 text-[#526878] sm:text-base">
              {job.summary}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {job.location ? (
                <HeroChip icon={<MapPin className="h-3.5 w-3.5" />}>
                  {job.location}
                </HeroChip>
              ) : null}
              {job.modality ? (
                <HeroChip icon={<BriefcaseBusiness className="h-3.5 w-3.5" />}>
                  {job.modality}
                </HeroChip>
              ) : null}
              {job.skills.slice(0, 2).map((skill) => (
                <HeroChip key={skill}>{skill}</HeroChip>
              ))}
            </div>
          </>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/portal/oportunidades"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#4374ba,#25c0d5)] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(67,116,186,0.22)]"
            >
              Ver oportunidad
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={`/portal/empresas/${job.companySlug}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#b9cce5] bg-white/70 px-5 text-sm font-bold text-[#315c96]"
            >
              Ver empresa
            </Link>
          </div>
        </div>
        <div className="relative hidden min-h-[230px] place-items-center lg:grid">
          <span className="grid h-40 w-40 place-items-center overflow-hidden rounded-[34px] border border-white/80 bg-white/76 shadow-[0_28px_70px_rgba(67,116,186,0.14)] backdrop-blur-xl">
            {job.companyLogo ? (
              <img
                src={job.companyLogo}
                alt={`Logo de ${job.company}`}
                className="h-full w-full object-contain p-7"
              />
            ) : (
              <BriefcaseBusiness className="h-16 w-16 text-[#4374ba]" />
            )}
          </span>
          <span className="absolute bottom-2 right-2 rounded-full border border-white bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#4374ba]">
            Publicado recientemente
          </span>
        </div>
      </div>
      <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-[#cfe1e6]/75 pt-4">
        <div className="flex items-center gap-2">
          {Array.from({ length: total }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Mostrar anuncio ${index + 1}`}
              aria-current={index === active ? "true" : undefined}
              className={`h-2 rounded-full transition-all ${index === active ? "w-8 bg-[#4374ba]" : "w-2 bg-[#a9bdd8] hover:bg-[#6f95c9]"}`}
            />
          ))}
        </div>
        {jobs.length > 1 ? (
          <div className="flex gap-2">
            <CarouselButton label="Anuncio anterior" onClick={previous}>
              <ArrowLeft className="h-4 w-4" />
            </CarouselButton>
            <CarouselButton label="Anuncio siguiente" onClick={next}>
              <ArrowRight className="h-4 w-4" />
            </CarouselButton>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function BetaCommunityHero() {
  const whatsappHref = "https://chat.whatsapp.com/JzGxQ59VC1X00qZqB1Qg2E";
  return (
    <section className="relative isolate overflow-hidden rounded-[26px] border border-[#4374ba]/25 bg-[#07111f] px-5 py-7 text-white shadow-[0_28px_70px_rgba(14,26,38,0.18)] sm:px-8 lg:min-h-[390px] lg:px-10 lg:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_57%_58%,rgba(37,192,213,0.18),transparent_25%),radial-gradient(circle_at_82%_20%,rgba(67,116,186,0.22),transparent_30%),linear-gradient(115deg,#07111f_0%,#0a1b30_55%,#0b2236_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(72,138,201,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(72,138,201,0.1)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:linear-gradient(to_right,transparent,black_48%,black)]" />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_250px_310px] lg:items-center">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[#25c0d5]/60 bg-[#25c0d5]/15 px-3 py-1 font-mono text-[11px] font-black uppercase tracking-[0.13em] text-[#80e8f4]">
              Beta
            </span>
            <span className="text-xs font-semibold text-[#d8e6f5]">
              Estamos en versión beta
            </span>
          </div>
          <h1 className="mt-5 font-display text-[clamp(2rem,3.5vw,3.35rem)] font-black leading-[1.06] tracking-[-0.035em] text-white">
            Construyamos juntos la mejor{" "}
            <span className="bg-[linear-gradient(90deg,#488ac9,#25c0d5)] bg-clip-text text-transparent">
              red profesional
            </span>{" "}
            para la industria.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-[#c4d1df] sm:text-base">
            Tu feedback nos ayuda a mejorar cada día. Únete a nuestra comunidad
            de WhatsApp y sé parte de la transformación de Terraqo.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#4374ba,#25c0d5)] px-5 text-sm font-black text-white shadow-[0_14px_34px_rgba(37,192,213,0.2)] transition hover:-translate-y-0.5 hover:brightness-110"
            >
              <MessageCircle className="h-5 w-5" />
              Unirme a la comunidad
            </a>
            <Link
              href="/portal/recompensas"
              className="inline-flex h-12 items-center gap-2 rounded-xl px-4 text-sm font-bold text-[#9fc4ff] transition hover:bg-white/5 hover:text-white"
            >
              Cómo funciona
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div
          className="relative hidden min-h-[265px] place-items-center lg:grid"
          aria-hidden="true"
        >
          <div className="absolute h-56 w-40 rounded-[34px] border border-[#488ac9]/35 bg-[linear-gradient(155deg,rgba(72,138,201,0.24),rgba(7,17,31,0.38))] shadow-[inset_0_0_40px_rgba(37,192,213,0.08),0_28px_70px_rgba(0,0,0,0.35)]" />
          <div className="absolute bottom-3 h-24 w-48 rounded-[50%] bg-[#25c0d5]/18 blur-2xl" />
          <span className="relative grid h-28 w-28 place-items-center rounded-[30px] border border-[#25c0d5]/35 bg-[#0b2035]/85 text-[#80e8f4] shadow-[0_0_50px_rgba(37,192,213,0.2)]">
            <Rocket className="h-16 w-16 -rotate-12" />
          </span>
          <span className="absolute left-2 top-16 grid h-10 w-10 place-items-center rounded-xl border border-[#488ac9]/35 bg-[#0d2034]/90 text-[#9fc4ff]">
            <Heart className="h-5 w-5" />
          </span>
          <span className="absolute right-0 top-24 grid h-10 w-12 place-items-center rounded-xl border border-[#25c0d5]/35 bg-[#0d2034]/90 text-[#80e8f4]">
            <MessageSquare className="h-5 w-5" />
          </span>
        </div>

        <aside className="rounded-[20px] border border-[#488ac9]/25 bg-[#102338]/72 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:p-6">
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#4374ba]/20 text-[#80e8f4]">
              <Gift className="h-5 w-5" />
            </span>
            <h2 className="font-display text-lg font-black">
              Premiamos tu aporte
            </h2>
          </div>
          <div className="divide-y divide-white/10">
            <RewardItem
              icon={<Bug className="h-4 w-4" />}
              title="Reporta errores"
              copy="Gana puntos"
            />
            <RewardItem
              icon={<Lightbulb className="h-4 w-4" />}
              title="Comparte sugerencias"
              copy="Gana puntos"
            />
            <RewardItem
              icon={<Trophy className="h-4 w-4" />}
              title="Participa activamente"
              copy="Accede a beneficios exclusivos"
            />
          </div>
          <Link
            href="/portal/recompensas"
            className="mt-4 flex items-center justify-between gap-3 text-xs font-black text-[#80e8f4] transition hover:text-white"
          >
            Conoce el sistema de recompensas
            <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </div>
    </section>
  );
}

function RewardItem({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 text-[#9fc4ff]">{icon}</span>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="mt-0.5 text-[11px] text-[#aebdcb]">{copy}</p>
      </div>
    </div>
  );
}

function NetworkStories({
  professionals,
  companies,
}: {
  professionals: ProfessionalItem[];
  companies: CompanyItem[];
}) {
  const [activeProfile, setActiveProfile] = useState<ProfessionalItem | null>(
    null,
  );
  const [closing, setClosing] = useState(false);
  const closeStory = () => {
    if (!activeProfile || closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setActiveProfile(null);
      setClosing(false);
    }, 180);
  };
  useEffect(() => {
    if (!activeProfile) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeStory();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
    // closeStory intentionally follows the active modal lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile]);
  if (!professionals.length && !companies.length) return null;
  return (
    <>
      <section
        aria-label="Trabajo documentado"
        className="mt-5 rounded-[22px] border border-[#d7e3e8] bg-white px-4 py-4 shadow-[0_10px_30px_rgba(11,35,48,0.045)] sm:px-6"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-[#102535]">
              Trabajo documentado
            </h2>
            <p className="mt-0.5 text-[11px] text-[#78909c]">
              Evidencia técnica reciente de tu red
            </p>
          </div>
          <Link
            href="/portal/bitacora"
            className="text-[11px] font-bold text-[#087d79]"
          >
            Registrar bitácora
          </Link>
        </div>
        <div className="-mx-2 mt-4 flex gap-5 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href="/portal/bitacora"
            className="group w-[74px] shrink-0 text-center"
          >
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-dashed border-[#9ebdc0] bg-[#f7fbfb] text-[#52717b] transition group-hover:border-[#087d79] group-hover:text-[#087d79]">
              <Plus className="h-5 w-5" />
            </span>
            <span className="mt-2 block text-[11px] font-semibold text-[#526878]">
              Documentar
            </span>
          </Link>
          {professionals.slice(0, 8).map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => {
                setClosing(false);
                setActiveProfile(profile);
              }}
              className="group w-[82px] shrink-0 text-center"
              aria-label={`Ver última bitácora de ${profile.name}`}
            >
              <StoryAvatar
                name={profile.name}
                image={profile.image}
                online={Boolean(
                  profile.onlineUntil &&
                  Date.parse(profile.onlineUntil) > Date.now(),
                )}
                hasStory={Boolean(profile.latestWorklog)}
              />
              <span className="mt-2 line-clamp-2 block text-[11px] font-bold leading-4 text-[#354c5d] group-hover:text-[#087d79]">
                {profile.name}
              </span>
            </button>
          ))}
          {companies.slice(0, 4).map((company) => (
            <Link
              key={company.id}
              href={
                company.publicSlug
                  ? `/portal/empresas/${company.publicSlug}`
                  : "/portal/operaciones"
              }
              className="group w-[82px] shrink-0 text-center"
            >
              <StoryAvatar
                name={company.name}
                image={company.logoUrl}
                online={false}
                hasStory={false}
              />
              <span className="mt-2 line-clamp-2 block text-[11px] font-bold leading-4 text-[#354c5d] group-hover:text-[#087d79]">
                {company.name}
              </span>
            </Link>
          ))}
        </div>
      </section>
      {activeProfile
        ? createPortal(
            <StoryModal
              profile={activeProfile}
              closing={closing}
              onClose={closeStory}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function StoryAvatar({
  name,
  image,
  online,
  hasStory,
}: {
  name: string;
  image?: string | null;
  online: boolean;
  hasStory: boolean;
}) {
  return (
    <span
      className={`relative mx-auto block h-16 w-16 rounded-full p-[2px] ${hasStory ? "bg-[linear-gradient(135deg,#0aa19a,#4374ba)]" : "bg-[#cddcdf]"}`}
    >
      <span className="grid h-full w-full place-items-center overflow-hidden rounded-full border-[3px] border-white bg-[#edf6f6] font-display text-sm font-bold text-[#087d79]">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          name
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
        )}
      </span>
      {online ? (
        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-emerald-500" />
      ) : null}
    </span>
  );
}

function StoryModal({
  profile,
  closing,
  onClose,
}: {
  profile: ProfessionalItem;
  closing: boolean;
  onClose: () => void;
}) {
  const worklog = profile.latestWorklog;
  const mediaIds = worklog?.mediaIds || [];
  const [activeMedia, setActiveMedia] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const previousMedia = () =>
    setActiveMedia(
      (current) => (current - 1 + mediaIds.length) % mediaIds.length,
    );
  const nextMedia = () =>
    setActiveMedia((current) => (current + 1) % mediaIds.length);
  const finishSwipe = (clientX: number) => {
    if (touchStart === null || mediaIds.length < 2) return setTouchStart(null);
    const distance = clientX - touchStart;
    if (Math.abs(distance) > 42) {
      if (distance > 0) previousMedia();
      else nextMedia();
    }
    setTouchStart(null);
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Historia de ${profile.name}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`fixed inset-0 z-[100] grid place-items-center bg-[#06151f]/70 p-3 backdrop-blur-sm transition-opacity duration-200 sm:p-6 ${closing ? "opacity-0" : "opacity-100"}`}
    >
      <article
        className={`relative grid max-h-[min(820px,calc(100dvh-24px))] w-full max-w-[920px] overflow-hidden rounded-[26px] border border-white/40 bg-white shadow-[0_36px_110px_rgba(0,0,0,0.34)] transition duration-200 md:grid-cols-[minmax(310px,1.05fr)_minmax(330px,0.95fr)] ${closing ? "translate-y-3 scale-[0.985] opacity-0" : "translate-y-0 scale-100 opacity-100"}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar historia"
          className="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full border border-[#d5e2e6] bg-white/90 text-[#354c5d] shadow-sm backdrop-blur hover:bg-white"
        >
          <X className="h-5 w-5" />
        </button>
        <div
          className="relative min-h-[260px] touch-pan-y select-none overflow-hidden bg-[linear-gradient(145deg,#0a2532,#087d79)] md:min-h-[590px]"
          onTouchStart={(event) =>
            setTouchStart(event.touches[0]?.clientX ?? null)
          }
          onTouchEnd={(event) =>
            finishSwipe(event.changedTouches[0]?.clientX ?? 0)
          }
        >
          {mediaIds.length ? (
            <div
              className="absolute inset-0 flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${activeMedia * 100}%)` }}
            >
              {mediaIds.map((mediaId, index) => (
                <img
                  key={mediaId}
                  src={`/api/terraqo/worklog/evidence/${mediaId}`}
                  alt={`Evidencia ${index + 1} de ${worklog?.title || profile.name}`}
                  className="h-full w-full shrink-0 object-cover"
                  draggable={false}
                />
              ))}
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_25%,rgba(38,201,190,0.32),transparent_38%),linear-gradient(145deg,#071d2a,#0a5f62)]" />
              <BriefcaseBusiness className="relative h-20 w-20 text-white/75" />
            </div>
          )}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/45 to-transparent" />
          <div className="absolute left-4 right-16 top-4 flex items-center gap-3 text-white">
            <UserAvatar
              name={profile.name}
              image={profile.image}
              size="sm"
              className="ring-2 ring-white/70"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{profile.name}</p>
              <p className="truncate text-[11px] text-white/80">
                {profile.roleTitle || profile.headline || "Profesional Terraqo"}
              </p>
            </div>
          </div>
          {mediaIds.length > 1 ? (
            <>
              <button
                type="button"
                onClick={previousMedia}
                aria-label="Foto anterior"
                className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/50 bg-black/25 text-white backdrop-blur transition hover:bg-black/45"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={nextMedia}
                aria-label="Foto siguiente"
                className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/50 bg-black/25 text-white backdrop-blur transition hover:bg-black/45"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/35 px-3 py-2 backdrop-blur">
                {mediaIds.map((mediaId, index) => (
                  <button
                    key={mediaId}
                    type="button"
                    onClick={() => setActiveMedia(index)}
                    aria-label={`Mostrar foto ${index + 1}`}
                    aria-current={activeMedia === index ? "true" : undefined}
                    className={`h-1.5 rounded-full transition-all ${activeMedia === index ? "w-6 bg-white" : "w-1.5 bg-white/55 hover:bg-white/80"}`}
                  />
                ))}
              </div>
              <span className="absolute bottom-4 right-4 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">
                {activeMedia + 1}/{mediaIds.length}
              </span>
            </>
          ) : null}
        </div>
        <div className="min-h-0 overflow-y-auto p-6 sm:p-8 md:pt-20">
          {worklog ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#087d79]">
                  Última bitácora
                </p>
                <span className="rounded-full bg-[#eaf7f6] px-2.5 py-1 text-[10px] font-bold text-[#087d79]">
                  {worklog.moderationStatus === "STRONG_VERIFIED"
                    ? "Validada con evidencia fuerte"
                    : worklog.moderationStatus === "PRIVATE_VALIDATED"
                      ? "Privada validada"
                      : worklog.moderationStatus === "VALIDATED"
                        ? "Validada"
                        : worklog.moderationStatus === "COMPLETE"
                          ? "Evidencia completa"
                          : "Declarada"}
                </span>
              </div>
              <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-[#102535] sm:text-3xl">
                {worklog.title}
              </h2>
              <p className="mt-4 whitespace-pre-line text-sm leading-6 text-[#526878]">
                {worklog.summary}
              </p>
              {worklog.outcome ? (
                <div className="mt-5 rounded-xl border-l-4 border-[#0aa19a] bg-[#edf8f7] px-4 py-3 text-sm leading-6 text-[#35545d]">
                  <strong>Resultado:</strong> {worklog.outcome}
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-2">
                {worklog.projectName ? (
                  <StoryDetail icon={<FolderKanban className="h-3.5 w-3.5" />}>
                    {worklog.projectName}
                  </StoryDetail>
                ) : null}
                {worklog.workspaceName ? (
                  <StoryDetail icon={<Building2 className="h-3.5 w-3.5" />}>
                    {worklog.workspaceName}
                  </StoryDetail>
                ) : null}
                <StoryDetail icon={<CalendarDays className="h-3.5 w-3.5" />}>
                  {new Intl.DateTimeFormat("es-PE", {
                    dateStyle: "medium",
                  }).format(new Date(worklog.occurredAt))}
                </StoryDetail>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {worklog.skills.slice(0, 4).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-lg bg-[#eff4f5] px-2.5 py-1 text-[11px] font-bold text-[#526878]"
                  >
                    #{skill}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <span className="rounded-lg bg-[#edf4fd] px-3 py-2 text-xs font-bold text-[#4374ba]">
                  +{worklog.tqPointsAwarded} TQ en espera
                </span>
                <span className="rounded-lg bg-[#eaf7f6] px-3 py-2 text-xs font-bold text-[#087d79]">
                  +{worklog.trustScoreAwarded} confianza
                </span>
              </div>
              <div className="mt-7 flex items-center gap-6 border-t border-[#e1eaed] pt-5 text-sm font-bold text-[#526878]">
                <span className="inline-flex items-center gap-2">
                  <Heart className="h-5 w-5 text-[#0aa19a]" />
                  {worklog.reactions}
                </span>
                <span className="inline-flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-[#4374ba]" />
                  {worklog.comments}
                </span>
                <Link
                  href={`/portal/profesionales/${profile.id}`}
                  className="ml-auto text-[#087d79] hover:underline"
                >
                  Ver perfil completo
                </Link>
              </div>
            </>
          ) : (
            <div className="grid min-h-[360px] content-center text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#eaf7f6] text-[#087d79]">
                <Sparkles className="h-6 w-6" />
              </span>
              <h2 className="mt-5 font-display text-2xl font-bold text-[#102535]">
                Aún no publicó una bitácora
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#667b89]">
                Puedes conocer su experiencia, habilidades y disponibilidad
                desde el perfil profesional.
              </p>
              <Link
                href={`/portal/profesionales/${profile.id}`}
                className="mx-auto mt-6 inline-flex h-11 items-center rounded-xl bg-[#087d79] px-5 text-sm font-bold text-white"
              >
                Ver perfil profesional
              </Link>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function StoryDetail({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d5e2e6] bg-[#f8fbfb] px-3 py-1.5 text-xs font-bold text-[#526878]">
      {icon}
      {children}
    </span>
  );
}

function HeroChip({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c9d7ea] bg-white/70 px-3 py-1.5 text-xs font-bold text-[#3c5f8d]">
      {icon}
      {children}
    </span>
  );
}
function CarouselButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-full border border-[#c5d4e7] bg-white/75 text-[#4374ba] transition hover:bg-white"
    >
      {children}
    </button>
  );
}

function ProfessionalsList({
  items,
  view,
}: {
  items: ProfessionalItem[];
  view: ViewMode;
}) {
  if (!items.length)
    return (
      <EmptyState text="No encontramos profesionales con esos criterios." />
    );
  return (
    <div
      className={
        view === "grid"
          ? "grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
          : "grid gap-4"
      }
    >
      {items.map((profile) => (
        <ProfessionalCard
          key={profile.id}
          profile={profile}
          compact={view === "list"}
        />
      ))}
    </div>
  );
}

function ProfessionalCard({
  profile,
  compact,
}: {
  profile: ProfessionalItem;
  compact: boolean;
}) {
  const available = ["AVAILABLE", "OPEN_TO_PROJECTS"].includes(profile.status);
  const online = Boolean(
    profile.onlineUntil && Date.parse(profile.onlineUntil) > Date.now(),
  );
  const boosted = Boolean(
    profile.profileBoostUntil &&
    Date.parse(profile.profileBoostUntil) > Date.now(),
  );
  const title = profile.roleTitle || profile.headline || "Perfil profesional";
  return (
    <article
      className={`group relative overflow-hidden rounded-[22px] border border-[#d8e4e8] bg-white p-5 shadow-[0_12px_38px_rgba(11,35,48,0.055)] transition duration-300 hover:-translate-y-1 hover:border-[#13a8a4]/50 hover:shadow-[0_20px_48px_rgba(8,125,121,0.12)] ${compact ? "lg:grid lg:grid-cols-[minmax(280px,1.15fr)_minmax(220px,1fr)_auto] lg:items-center lg:gap-6" : "flex min-h-[330px] flex-col"}`}
    >
      <div className="flex min-w-0 items-start gap-4">
        <div className="relative shrink-0">
          <UserAvatar
            name={profile.name}
            image={profile.image}
            size="lg"
            className="ring-4 ring-[#eef7f7]"
          />
          <span
            className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[3px] border-white ${online ? "bg-emerald-500" : "bg-slate-400"}`}
            title={online ? "En línea" : "Fuera de línea"}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h2 className="font-display text-lg font-bold leading-6 text-[#102535]">
              {profile.name}
            </h2>
            {profile.verified ? (
              <BadgeCheck
                className="mt-0.5 h-4 w-4 shrink-0 fill-[#dff5f2] text-[#087d79]"
                aria-label="Identidad verificada"
              />
            ) : null}
          </div>
          <p className="mt-1 text-sm font-bold leading-5 text-[#087d79]">
            {title}
          </p>
          <p className="mt-1 truncate text-xs font-medium text-[#667b89]">
            {profile.workspaceName}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-[#667b89]">
            <MapPin className="h-3.5 w-3.5 text-[#0aa19a]" />
            {profile.locationCity || profile.city || "Ubicación por completar"}
          </p>
        </div>
      </div>
      <div className={`${compact ? "mt-4 lg:mt-0" : "mt-5 flex-1"}`}>
        <div className="flex flex-wrap gap-1.5">
          {profile.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="rounded-lg bg-[#f0f5f6] px-2.5 py-1 text-[11px] font-bold text-[#48606f]"
            >
              {skill}
            </span>
          ))}
          {profile.skills.length > 3 ? (
            <span className="rounded-lg bg-[#e5f4f3] px-2.5 py-1 text-[11px] font-bold text-[#087d79]">
              +{profile.skills.length - 3}
            </span>
          ) : null}
          {!profile.skills.length ? (
            <span className="text-xs text-[#7a8d99]">
              Especialidades por completar
            </span>
          ) : null}
        </div>
        <p className="mt-4 text-xs leading-5 text-[#667b89]">
          CV vivo con{" "}
          <strong className="text-[#354c5d]">
            {profile.visibleExperiences}
          </strong>{" "}
          experiencias visibles
          {profile.verifiedExperiences
            ? ` · ${profile.verifiedExperiences} verificadas`
            : ""}
          .
        </p>
      </div>
      <div
        className={`${compact ? "mt-4 min-w-[220px] lg:mt-0" : "mt-5 border-t border-[#e4ecef] pt-4"}`}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${boosted ? "bg-[#edf4fd] text-[#4374ba]" : available ? "bg-[#e4f7ed] text-[#14764a]" : "bg-[#f1f4f5] text-[#6b7e8a]"}`}
          >
            {boosted
              ? "Perfil destacado"
              : available
                ? "Disponible para proyectos"
                : "No disponible"}
          </span>
          <span className="text-[10px] font-semibold text-[#7a8d99]">
            {profile.foundingBuilder
              ? "Founding Builder"
              : online
                ? "En línea"
                : "Fuera de línea"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ButtonLink href={`/portal/profesionales/${profile.id}`}>
            Ver perfil
          </ButtonLink>
          {profile.friendship?.status === "ACCEPTED" ? (
            <ButtonLink
              href={`/portal/mensajes?recipient=${profile.userId}`}
              primary
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Mensaje
            </ButtonLink>
          ) : (
            <span className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#d7e3e8] bg-slate-50 px-3 text-xs font-bold text-slate-400">
              Mensaje
            </span>
          )}
          <FriendButton
            recipientId={profile.userId}
            initial={profile.friendship}
          />
        </div>
      </div>
    </article>
  );
}

function CompaniesList({
  items,
  view,
}: {
  items: CompanyItem[];
  view: ViewMode;
}) {
  if (!items.length)
    return (
      <EmptyState text="No hay empresas visibles en tus espacios autorizados." />
    );
  return (
    <div
      className={
        view === "grid"
          ? "grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
          : "grid gap-4"
      }
    >
      {items.map((company) => (
        <article
          key={company.id}
          className={`rounded-[22px] border border-[#d8e4e8] bg-white p-5 shadow-[0_12px_38px_rgba(11,35,48,0.055)] transition hover:-translate-y-1 hover:border-[#13a8a4]/50 ${view === "list" ? "lg:flex lg:items-center lg:gap-6" : ""}`}
        >
          <CompanyMark name={company.name} logoUrl={company.logoUrl} />
          <div className="min-w-0 flex-1">
            <h2 className="mt-4 font-display text-xl font-bold text-[#102535] lg:mt-0">
              {company.name}
            </h2>
            <p className="mt-1 text-sm font-bold text-[#087d79]">
              {company.industry || "Empresa conectada"}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[#667b89]">
              <MapPin className="h-3.5 w-3.5" />
              {company.city || "Ubicación por completar"}
            </p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 lg:ml-auto lg:mt-0 lg:min-w-[250px]">
            <ButtonLink
              href={
                company.publicSlug
                  ? `/portal/empresas/${company.publicSlug}`
                  : "/portal/operaciones"
              }
            >
              Ver empresa
            </ButtonLink>
            <ButtonLink href="/portal/mensajes" primary>
              Contactar
            </ButtonLink>
          </div>
        </article>
      ))}
    </div>
  );
}

function GroupsList({ items, view }: { items: GroupItem[]; view: ViewMode }) {
  if (!items.length)
    return (
      <EmptyState text="Todavía no hay equipos visibles en tus espacios." />
    );
  return (
    <div
      className={
        view === "grid"
          ? "grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
          : "grid gap-4"
      }
    >
      {items.map((group) => (
        <article
          key={group.id}
          className={`rounded-[22px] border border-[#d8e4e8] bg-white p-5 shadow-[0_12px_38px_rgba(11,35,48,0.055)] transition hover:-translate-y-1 hover:border-[#13a8a4]/50 ${view === "list" ? "lg:flex lg:items-center lg:gap-6" : ""}`}
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#e2f5f3,#e7f1f7)] text-[#087d79]">
            <UsersRound className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="mt-4 font-display text-xl font-bold text-[#102535] lg:mt-0">
              {group.name}
            </h2>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#526878]">
              {group.purpose}
            </p>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#087d79]">
              {group.workspaceName} · {group.members} miembros
            </p>
          </div>
          <div className="mt-5 lg:ml-auto lg:mt-0">
            <ButtonLink href={`/portal/equipos/${group.id}`} primary>
              Ver equipo
            </ButtonLink>
          </div>
        </article>
      ))}
    </div>
  );
}

function CompanyMark({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl?: string | null;
}) {
  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#d8e4e8] bg-[#eef7f7] font-display text-lg font-bold text-[#087d79]">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`Logo de ${name}`}
          className="h-full w-full object-contain p-1.5"
        />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-[#526878]">
      {label}
      <select
        className="h-11 min-w-0 rounded-xl border border-[#d7e3e8] bg-white px-3 text-sm font-semibold text-[#354c5d] outline-none focus:border-[#13a8a4]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg transition ${active ? "bg-[#087d79] text-white" : "text-[#667b89] hover:bg-[#edf6f6]"}`}
      aria-label={label}
    >
      {children}
    </button>
  );
}
function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-[#bcd5da] bg-[linear-gradient(135deg,#f8fbfb,#eef7f7)] p-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#087d79] shadow-sm">
        <Sparkles className="h-5 w-5" />
      </span>
      <p className="mt-4 text-sm font-semibold text-[#526878]">{text}</p>
    </div>
  );
}
function ButtonLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${primary ? "border-[#087d79] bg-[linear-gradient(135deg,#087d79,#0aa19a)] text-white shadow-[0_8px_18px_rgba(8,125,121,0.16)] hover:brightness-105" : "border-[#d7e3e8] bg-white text-[#354c5d] hover:border-[#13a8a4] hover:bg-[#eef8f7]"}`}
    >
      {children}
    </Link>
  );
}
