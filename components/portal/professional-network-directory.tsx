"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeCheck, Building2, ChevronDown, Grid2X2, List, MapPin, MessageSquare, Search, SlidersHorizontal, Sparkles, UserPlus, UsersRound, X } from "lucide-react";
import { UserAvatar } from "@/components/terraqo/user-avatar";

type DirectoryMode = "professionals" | "companies" | "groups";
type ViewMode = "grid" | "list";
type ProfessionalItem = { id: string; name: string; image?: string | null; headline?: string | null; roleTitle?: string | null; city?: string | null; locationCity?: string | null; status: string; verified: boolean; workspaceName: string; skills: string[]; visibleExperiences: number; verifiedExperiences: number; lastSeenAt?: string | null; onlineUntil?: string | null; updatedAt: string };
type CompanyItem = { id: string; name: string; document?: string | null; city?: string | null; industry?: string | null; status: string; publicSlug?: string | null; logoUrl?: string | null; updatedAt: string };
type GroupItem = { id: string; name: string; purpose: string; workspaceName: string; members: number; updatedAt: string };
type DirectoryProps = { professionals: ProfessionalItem[]; companies: CompanyItem[]; groups: GroupItem[] };

const tabs = [
  { value: "professionals" as const, label: "Profesionales", icon: UsersRound },
  { value: "companies" as const, label: "Empresas", icon: Building2 },
  { value: "groups" as const, label: "Equipos", icon: UserPlus }
];

function normalized(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

export function ProfessionalNetworkDirectory({ professionals, companies, groups }: DirectoryProps) {
  const [mode, setMode] = useState<DirectoryMode>("professionals");
  const [view, setView] = useState<ViewMode>("grid");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("relevant");
  const [location, setLocation] = useState("all");
  const [specialty, setSpecialty] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const locationOptions = useMemo(() => Array.from(new Set(professionals.map((item) => item.locationCity || item.city).filter(Boolean) as string[])).sort(), [professionals]);
  const specialtyOptions = useMemo(() => Array.from(new Set(professionals.flatMap((item) => item.skills).filter(Boolean))).sort(), [professionals]);
  const activeFilterCount = Number(location !== "all") + Number(specialty !== "all") + Number(availability !== "all");

  const visibleProfessionals = useMemo(() => {
    const needle = normalized(query);
    return professionals.filter((item) => {
      const haystack = normalized([item.name, item.headline, item.roleTitle, item.workspaceName, item.city, item.locationCity, ...item.skills].filter(Boolean).join(" "));
      if (needle && !haystack.includes(needle)) return false;
      if (location !== "all" && (item.locationCity || item.city) !== location) return false;
      if (specialty !== "all" && !item.skills.includes(specialty)) return false;
      if (availability === "available" && !["AVAILABLE", "OPEN_TO_PROJECTS"].includes(item.status)) return false;
      if (availability === "online" && (!item.onlineUntil || Date.parse(item.onlineUntil) <= Date.now())) return false;
      if (availability === "verified" && !item.verified) return false;
      return true;
    }).sort((left, right) => {
      if (sort === "recent") return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      if (sort === "available") return Number(["AVAILABLE", "OPEN_TO_PROJECTS"].includes(right.status)) - Number(["AVAILABLE", "OPEN_TO_PROJECTS"].includes(left.status));
      return Number(right.verified) - Number(left.verified) || right.verifiedExperiences - left.verifiedExperiences || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }, [availability, location, professionals, query, sort, specialty]);

  const visibleCompanies = useMemo(() => { const needle = normalized(query); return companies.filter((item) => !needle || normalized([item.name, item.document, item.city, item.industry, item.status].filter(Boolean).join(" ")).includes(needle)).sort((left, right) => sort === "recent" ? Date.parse(right.updatedAt) - Date.parse(left.updatedAt) : left.name.localeCompare(right.name, "es")); }, [companies, query, sort]);
  const visibleGroups = useMemo(() => { const needle = normalized(query); return groups.filter((item) => !needle || normalized([item.name, item.purpose, item.workspaceName].join(" ")).includes(needle)).sort((left, right) => sort === "recent" ? Date.parse(right.updatedAt) - Date.parse(left.updatedAt) : right.members - left.members); }, [groups, query, sort]);
  const count = mode === "professionals" ? visibleProfessionals.length : mode === "companies" ? visibleCompanies.length : visibleGroups.length;
  const totalLabel = mode === "professionals" ? "profesionales conectados" : mode === "companies" ? "empresas en tu red" : "equipos disponibles";
  function clearFilters() { setLocation("all"); setSpecialty("all"); setAvailability("all"); }

  return <div className="min-w-0 pb-12 pt-5 lg:pt-8">
    <header className="relative overflow-hidden rounded-[26px] border border-[#cfe1e6] bg-[linear-gradient(120deg,#f7fbfc_0%,#eef8f8_55%,#e8f4f8_100%)] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
      <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,rgba(22,174,173,0.13),transparent_68%)]" />
      <div className="relative max-w-4xl"><p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#087d79]">Red profesional Terraqo</p><h1 className="mt-3 max-w-3xl font-display text-[clamp(2rem,4.6vw,3.75rem)] font-bold leading-[1.04] tracking-[-0.035em] text-[#0b1d2b]">Encuentra capacidades reales para <span className="text-[#087d79]">hacer avanzar el trabajo.</span></h1><p className="mt-4 max-w-2xl text-sm leading-6 text-[#526878] sm:text-base">Explora profesionales, empresas y equipos de tus espacios autorizados. Compara experiencia visible, disponibilidad y especialidades antes de conectar.</p></div>
    </header>

    <section className="sticky top-[72px] z-20 -mx-2 mt-5 rounded-2xl border border-[#d7e3e8] bg-white/95 p-2 shadow-[0_14px_40px_rgba(11,35,48,0.08)] backdrop-blur-xl sm:mx-0 sm:p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667b89]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, empresa, profesión o habilidad" className="h-12 w-full rounded-xl border border-[#d7e3e8] bg-[#f7fafb] pl-11 pr-10 text-sm font-medium text-[#183042] outline-none transition focus:border-[#13a8a4] focus:bg-white focus:ring-4 focus:ring-[#13a8a4]/10" />{query ? <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[#667b89] hover:bg-[#e7f2f3]" aria-label="Limpiar búsqueda"><X className="h-4 w-4" /></button> : null}</label>
        <div className="grid grid-cols-3 rounded-xl border border-[#d7e3e8] bg-white p-1 xl:w-[440px]">{tabs.map((tab) => { const Icon = tab.icon; const active = mode === tab.value; return <button key={tab.value} type="button" onClick={() => setMode(tab.value)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-2 text-xs font-bold transition sm:text-sm ${active ? "bg-[linear-gradient(135deg,#087d79,#0aa19a)] text-white shadow-[0_8px_20px_rgba(8,125,121,0.2)]" : "text-[#526878] hover:bg-[#edf6f6]"}`}><Icon className="h-4 w-4" /><span className="hidden min-[390px]:inline">{tab.label}</span></button>; })}</div>
      </div>
    </section>

    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#526878]"><strong className="text-lg text-[#102535]">{count}</strong> {totalLabel}</p><div className="flex flex-wrap items-center gap-2">
        <label className="relative"><select value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 appearance-none rounded-xl border border-[#d7e3e8] bg-white pl-3 pr-9 text-xs font-bold text-[#354c5d] outline-none sm:text-sm"><option value="relevant">Más relevantes</option><option value="available">Disponibles primero</option><option value="recent">Más recientes</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667b89]" /></label>
        <div className="hidden rounded-xl border border-[#d7e3e8] bg-white p-1 sm:flex"><ViewButton active={view === "grid"} onClick={() => setView("grid")} label="Vista en cuadrícula"><Grid2X2 className="h-4 w-4" /></ViewButton><ViewButton active={view === "list"} onClick={() => setView("list")} label="Vista en lista"><List className="h-4 w-4" /></ViewButton></div>
        {mode === "professionals" ? <button type="button" onClick={() => setFiltersOpen((value) => !value)} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition sm:text-sm ${filtersOpen || activeFilterCount ? "border-[#0b8e88] bg-[#e9f7f6] text-[#087d79]" : "border-[#d7e3e8] bg-white text-[#354c5d]"}`}><SlidersHorizontal className="h-4 w-4" />Filtros{activeFilterCount ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#087d79] px-1 text-[10px] text-white">{activeFilterCount}</span> : null}</button> : null}
      </div></div>
      {mode === "professionals" && (filtersOpen || activeFilterCount) ? <div className="grid gap-3 rounded-2xl border border-[#d7e3e8] bg-[#f8fbfb] p-4 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"><FilterSelect label="Ubicación" value={location} onChange={setLocation} options={[{ value: "all", label: "Todas" }, ...locationOptions.map((item) => ({ value: item, label: item }))]} /><FilterSelect label="Especialidad" value={specialty} onChange={setSpecialty} options={[{ value: "all", label: "Todas" }, ...specialtyOptions.map((item) => ({ value: item, label: item }))]} /><FilterSelect label="Disponibilidad" value={availability} onChange={setAvailability} options={[{ value: "all", label: "Todas" }, { value: "available", label: "Disponible para proyectos" }, { value: "online", label: "En línea ahora" }, { value: "verified", label: "Identidad verificada" }]} /><button type="button" onClick={clearFilters} disabled={!activeFilterCount} className="h-11 rounded-xl px-4 text-sm font-bold text-[#087d79] disabled:opacity-40">Limpiar filtros</button></div> : null}
      {mode === "professionals" ? <ProfessionalsList items={visibleProfessionals} view={view} /> : null}{mode === "companies" ? <CompaniesList items={visibleCompanies} view={view} /> : null}{mode === "groups" ? <GroupsList items={visibleGroups} view={view} /> : null}
    </div>
  </div>;
}

function ProfessionalsList({ items, view }: { items: ProfessionalItem[]; view: ViewMode }) { if (!items.length) return <EmptyState text="No encontramos profesionales con esos criterios." />; return <div className={view === "grid" ? "grid gap-4 md:grid-cols-2 2xl:grid-cols-3" : "grid gap-4"}>{items.map((profile) => <ProfessionalCard key={profile.id} profile={profile} compact={view === "list"} />)}</div>; }

function ProfessionalCard({ profile, compact }: { profile: ProfessionalItem; compact: boolean }) {
  const available = ["AVAILABLE", "OPEN_TO_PROJECTS"].includes(profile.status); const online = Boolean(profile.onlineUntil && Date.parse(profile.onlineUntil) > Date.now()); const title = profile.roleTitle || profile.headline || "Perfil profesional";
  return <article className={`group relative overflow-hidden rounded-[22px] border border-[#d8e4e8] bg-white p-5 shadow-[0_12px_38px_rgba(11,35,48,0.055)] transition duration-300 hover:-translate-y-1 hover:border-[#13a8a4]/50 hover:shadow-[0_20px_48px_rgba(8,125,121,0.12)] ${compact ? "lg:grid lg:grid-cols-[minmax(280px,1.15fr)_minmax(220px,1fr)_auto] lg:items-center lg:gap-6" : "flex min-h-[390px] flex-col"}`}>
    <div className="flex min-w-0 items-start gap-4"><div className="relative shrink-0"><UserAvatar name={profile.name} image={profile.image} size="lg" className="ring-4 ring-[#eef7f7]" /><span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[3px] border-white ${online ? "bg-emerald-500" : "bg-slate-400"}`} title={online ? "En línea" : "Fuera de línea"} /></div><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><h2 className="font-display text-lg font-bold leading-6 text-[#102535]">{profile.name}</h2>{profile.verified ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 fill-[#dff5f2] text-[#087d79]" aria-label="Identidad verificada" /> : null}</div><p className="mt-1 text-sm font-bold leading-5 text-[#087d79]">{title}</p><p className="mt-1 truncate text-xs font-medium text-[#667b89]">{profile.workspaceName}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-[#667b89]"><MapPin className="h-3.5 w-3.5 text-[#0aa19a]" />{profile.locationCity || profile.city || "Ubicación por completar"}</p></div></div>
    <div className={`${compact ? "mt-4 lg:mt-0" : "mt-5 flex-1"}`}><div className="flex flex-wrap gap-1.5">{profile.skills.slice(0, 3).map((skill) => <span key={skill} className="rounded-lg bg-[#f0f5f6] px-2.5 py-1 text-[11px] font-bold text-[#48606f]">{skill}</span>)}{profile.skills.length > 3 ? <span className="rounded-lg bg-[#e5f4f3] px-2.5 py-1 text-[11px] font-bold text-[#087d79]">+{profile.skills.length - 3}</span> : null}{!profile.skills.length ? <span className="text-xs text-[#7a8d99]">Especialidades por completar</span> : null}</div><p className="mt-4 text-xs leading-5 text-[#667b89]">CV vivo con <strong className="text-[#354c5d]">{profile.visibleExperiences}</strong> experiencias visibles{profile.verifiedExperiences ? ` · ${profile.verifiedExperiences} verificadas` : ""}.</p></div>
    <div className={`${compact ? "mt-4 min-w-[220px] lg:mt-0" : "mt-5 border-t border-[#e4ecef] pt-4"}`}><div className="mb-3 flex items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${available ? "bg-[#e4f7ed] text-[#14764a]" : "bg-[#f1f4f5] text-[#6b7e8a]"}`}>{available ? "Disponible para proyectos" : "No disponible"}</span><span className="text-[10px] font-semibold text-[#7a8d99]">{online ? "En línea" : "Fuera de línea"}</span></div><div className="grid grid-cols-2 gap-2"><ButtonLink href={`/portal/profesionales/${profile.id}`}>Ver perfil</ButtonLink><ButtonLink href="/portal/mensajes" primary><MessageSquare className="h-3.5 w-3.5" />Conectar</ButtonLink></div></div>
  </article>;
}

function CompaniesList({ items, view }: { items: CompanyItem[]; view: ViewMode }) { if (!items.length) return <EmptyState text="No hay empresas visibles en tus espacios autorizados." />; return <div className={view === "grid" ? "grid gap-4 md:grid-cols-2 2xl:grid-cols-3" : "grid gap-4"}>{items.map((company) => <article key={company.id} className={`rounded-[22px] border border-[#d8e4e8] bg-white p-5 shadow-[0_12px_38px_rgba(11,35,48,0.055)] transition hover:-translate-y-1 hover:border-[#13a8a4]/50 ${view === "list" ? "lg:flex lg:items-center lg:gap-6" : ""}`}><CompanyMark name={company.name} logoUrl={company.logoUrl} /><div className="min-w-0 flex-1"><h2 className="mt-4 font-display text-xl font-bold text-[#102535] lg:mt-0">{company.name}</h2><p className="mt-1 text-sm font-bold text-[#087d79]">{company.industry || "Empresa conectada"}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-[#667b89]"><MapPin className="h-3.5 w-3.5" />{company.city || "Ubicación por completar"}</p></div><div className="mt-5 grid grid-cols-2 gap-2 lg:ml-auto lg:mt-0 lg:min-w-[250px]"><ButtonLink href={company.publicSlug ? `/portal/empresas/${company.publicSlug}` : "/portal/operaciones"}>Ver empresa</ButtonLink><ButtonLink href="/portal/mensajes" primary>Contactar</ButtonLink></div></article>)}</div>; }

function GroupsList({ items, view }: { items: GroupItem[]; view: ViewMode }) { if (!items.length) return <EmptyState text="Todavía no hay equipos visibles en tus espacios." />; return <div className={view === "grid" ? "grid gap-4 md:grid-cols-2 2xl:grid-cols-3" : "grid gap-4"}>{items.map((group) => <article key={group.id} className={`rounded-[22px] border border-[#d8e4e8] bg-white p-5 shadow-[0_12px_38px_rgba(11,35,48,0.055)] transition hover:-translate-y-1 hover:border-[#13a8a4]/50 ${view === "list" ? "lg:flex lg:items-center lg:gap-6" : ""}`}><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#e2f5f3,#e7f1f7)] text-[#087d79]"><UsersRound className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h2 className="mt-4 font-display text-xl font-bold text-[#102535] lg:mt-0">{group.name}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-[#526878]">{group.purpose}</p><p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#087d79]">{group.workspaceName} · {group.members} miembros</p></div><div className="mt-5 lg:ml-auto lg:mt-0"><ButtonLink href={`/portal/equipos/${group.id}`} primary>Ver equipo</ButtonLink></div></article>)}</div>; }

function CompanyMark({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#d8e4e8] bg-[#eef7f7] font-display text-lg font-bold text-[#087d79]">
    {logoUrl ? (
      // Company logos can be stored in Terraqo or an approved workspace provider.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={`Logo de ${name}`} className="h-full w-full object-contain p-1.5" />
    ) : name.slice(0, 2).toUpperCase()}
  </span>;
}
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <label className="grid gap-1.5 text-xs font-bold text-[#526878]">{label}<select className="h-11 min-w-0 rounded-xl border border-[#d7e3e8] bg-white px-3 text-sm font-semibold text-[#354c5d] outline-none focus:border-[#13a8a4]" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function ViewButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`grid h-8 w-8 place-items-center rounded-lg transition ${active ? "bg-[#087d79] text-white" : "text-[#667b89] hover:bg-[#edf6f6]"}`} aria-label={label}>{children}</button>; }
function EmptyState({ text }: { text: string }) { return <div className="rounded-[22px] border border-dashed border-[#bcd5da] bg-[linear-gradient(135deg,#f8fbfb,#eef7f7)] p-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#087d79] shadow-sm"><Sparkles className="h-5 w-5" /></span><p className="mt-4 text-sm font-semibold text-[#526878]">{text}</p></div>; }
function ButtonLink({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) { return <Link href={href} className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${primary ? "border-[#087d79] bg-[linear-gradient(135deg,#087d79,#0aa19a)] text-white shadow-[0_8px_18px_rgba(8,125,121,0.16)] hover:brightness-105" : "border-[#d7e3e8] bg-white text-[#354c5d] hover:border-[#13a8a4] hover:bg-[#eef8f7]"}`}>{children}</Link>; }
