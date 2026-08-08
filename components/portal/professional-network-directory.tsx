"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, Filter, Grid2X2, List, MapPin, Search, UserPlus, UsersRound } from "lucide-react";
import { UserAvatar } from "@/components/terraqo/user-avatar";

type DirectoryMode = "professionals" | "companies" | "groups";
type ViewMode = "grid" | "list";

type ProfessionalItem = {
  id: string;
  name: string;
  image?: string | null;
  headline?: string | null;
  city?: string | null;
  locationCity?: string | null;
  status: string;
  workspaceName: string;
  skills: string[];
  verifiedExperiences: number;
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

type DirectoryProps = {
  professionals: ProfessionalItem[];
  companies: CompanyItem[];
  groups: GroupItem[];
};

const tabs = [
  { value: "professionals" as const, label: "Profesionales", icon: UsersRound },
  { value: "companies" as const, label: "Empresas", icon: Building2 },
  { value: "groups" as const, label: "Grupos", icon: UserPlus },
];

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function ProfessionalNetworkDirectory({ professionals, companies, groups }: DirectoryProps) {
  const [mode, setMode] = useState<DirectoryMode>("professionals");
  const [view, setView] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("relevant");
  const [location, setLocation] = useState("all");
  const [specialty, setSpecialty] = useState("all");
  const [availability, setAvailability] = useState("all");

  const locationOptions = useMemo(() => Array.from(new Set(professionals.map((item) => item.locationCity || item.city).filter(Boolean) as string[])).sort(), [professionals]);
  const specialtyOptions = useMemo(() => Array.from(new Set(professionals.flatMap((item) => item.skills))).sort(), [professionals]);

  const visibleProfessionals = useMemo(() => {
    const needle = normalized(query);
    return professionals
      .filter((item) => {
        const haystack = normalized([item.name, item.headline, item.workspaceName, item.city, item.locationCity, ...item.skills].filter(Boolean).join(" "));
        if (needle && !haystack.includes(needle)) return false;
        if (location !== "all" && (item.locationCity || item.city) !== location) return false;
        if (specialty !== "all" && !item.skills.includes(specialty)) return false;
        if (availability === "available" && !["AVAILABLE", "OPEN_TO_PROJECTS"].includes(item.status)) return false;
        return true;
      })
      .sort((left, right) => {
        if (sort === "recent") return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        if (sort === "available") return Number(["AVAILABLE", "OPEN_TO_PROJECTS"].includes(right.status)) - Number(["AVAILABLE", "OPEN_TO_PROJECTS"].includes(left.status));
        return right.verifiedExperiences - left.verifiedExperiences || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      });
  }, [availability, location, professionals, query, sort, specialty]);

  const visibleCompanies = useMemo(() => {
    const needle = normalized(query);
    return companies
      .filter((item) => {
        const haystack = normalized([item.name, item.document, item.city, item.industry, item.status].filter(Boolean).join(" "));
        return !needle || haystack.includes(needle);
      })
      .sort((left, right) => sort === "recent" ? Date.parse(right.updatedAt) - Date.parse(left.updatedAt) : left.name.localeCompare(right.name, "es"));
  }, [companies, query, sort]);

  const visibleGroups = useMemo(() => {
    const needle = normalized(query);
    return groups
      .filter((item) => {
        const haystack = normalized([item.name, item.purpose, item.workspaceName].join(" "));
        return !needle || haystack.includes(needle);
      })
      .sort((left, right) => sort === "recent" ? Date.parse(right.updatedAt) - Date.parse(left.updatedAt) : right.members - left.members);
  }, [groups, query, sort]);

  const count = mode === "professionals" ? visibleProfessionals.length : mode === "companies" ? visibleCompanies.length : visibleGroups.length;

  function clearFilters() {
    setQuery("");
    setSort("relevant");
    setLocation("all");
    setSpecialty("all");
    setAvailability("all");
  }

  return (
    <div className="min-w-0 space-y-7 py-6 lg:py-8">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Red profesional</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-[#0b202b] md:text-5xl">Buscar profesionales</h1>
          <p className="mt-3 max-w-3xl text-[#496471]">Encuentra y conecta con profesionales, empresas y grupos dentro de tus espacios autorizados.</p>
        </div>
        <label className="relative block w-full min-w-[280px] sm:w-[430px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b818a]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar profesionales, empresas, habilidades..."
            className="h-12 w-full rounded-lg border border-[#d4e4e2] bg-white pl-11 pr-4 text-sm font-medium text-[#314b57] shadow-[0_12px_28px_rgba(15,59,67,0.05)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-grid overflow-hidden rounded-lg border border-[#d4e4e2] bg-white p-1 sm:grid-cols-3">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = mode === tab.value;
                return (
                  <button key={tab.value} type="button" onClick={() => setMode(tab.value)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-5 text-sm font-bold ${active ? "bg-primary text-white" : "text-[#314b57] hover:bg-[#eef8f7]"}`}>
                    <Icon className="h-4 w-4" /> {tab.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Ordenar resultados" className="h-10 rounded-lg border border-[#d4e4e2] bg-white px-3 text-sm font-semibold text-[#314b57]">
                <option value="relevant">Mas relevantes</option>
                <option value="available">Disponibles primero</option>
                <option value="recent">Mas recientes</option>
              </select>
              <button type="button" onClick={() => setView("grid")} className={`grid h-10 w-10 place-items-center rounded-lg border ${view === "grid" ? "border-primary bg-primary text-white" : "border-[#d4e4e2] bg-white text-[#496471]"}`} aria-label="Vista en tarjetas"><Grid2X2 className="h-4 w-4" /></button>
              <button type="button" onClick={() => setView("list")} className={`grid h-10 w-10 place-items-center rounded-lg border ${view === "list" ? "border-primary bg-primary text-white" : "border-[#d4e4e2] bg-white text-[#496471]"}`} aria-label="Vista en lista"><List className="h-4 w-4" /></button>
            </div>
          </div>

          <p className="text-sm font-bold text-[#314b57]">{count} {mode === "professionals" ? "profesionales" : mode === "companies" ? "empresas" : "grupos"} encontrados</p>

          {mode === "professionals" ? <ProfessionalsList items={visibleProfessionals} view={view} /> : null}
          {mode === "companies" ? <CompaniesList items={visibleCompanies} view={view} /> : null}
          {mode === "groups" ? <GroupsList items={visibleGroups} view={view} /> : null}
        </section>

        <aside className="h-fit rounded-xl border border-[#d4e4e2] bg-white p-5 shadow-[0_14px_36px_rgba(10,45,52,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-lg font-bold text-[#0b202b]">Filtros de busqueda</p>
            <button type="button" onClick={clearFilters} className="text-sm font-bold text-primary">Limpiar filtros</button>
          </div>
          <div className="mt-5 space-y-5">
            <FilterSelect label="Ubicacion" value={location} onChange={setLocation} options={[{ value: "all", label: "Todas las ubicaciones" }, ...locationOptions.map((item) => ({ value: item, label: item }))]} />
            <FilterSelect label="Especialidad" value={specialty} onChange={setSpecialty} options={[{ value: "all", label: "Todas las especialidades" }, ...specialtyOptions.map((item) => ({ value: item, label: item }))]} />
            <FilterSelect label="Disponibilidad" value={availability} onChange={setAvailability} options={[{ value: "all", label: "Todas" }, { value: "available", label: "Disponible ahora" }]} />
          </div>
          <button type="button" className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white">
            <Filter className="h-4 w-4" /> Aplicar filtros
          </button>
        </aside>
      </div>
    </div>
  );
}

function ProfessionalsList({ items, view }: { items: ProfessionalItem[]; view: ViewMode }) {
  if (!items.length) return <EmptyState text="No encontramos profesionales con esos filtros." />;
  return (
    <div className={view === "grid" ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
      {items.map((profile) => {
        const available = ["AVAILABLE", "OPEN_TO_PROJECTS"].includes(profile.status);
        return (
          <article key={profile.id} className={`rounded-xl border border-[#d4e4e2] bg-white p-5 shadow-[0_14px_36px_rgba(10,45,52,0.06)] transition hover:-translate-y-0.5 hover:border-primary/45 ${view === "list" ? "grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(240px,0.85fr)_auto] md:items-center" : "space-y-4"}`}>
            <div className="relative w-fit">
              <UserAvatar name={profile.name} image={profile.image} size="xl" />
              {available ? <span className="absolute bottom-2 right-2 h-4 w-4 rounded-full border-2 border-white bg-emerald-500" /> : null}
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl font-bold text-[#0b202b]">{profile.name}</h2>
              <p className="mt-1 font-bold text-primary">{profile.headline || "Perfil profesional"}</p>
              <p className="mt-1 text-sm text-[#496471]">{profile.workspaceName}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-[#637b86]"><MapPin className="h-4 w-4" /> {profile.locationCity || profile.city || "Ubicacion por confirmar"}</p>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                {profile.skills.length ? profile.skills.slice(0, 4).map((skill) => <span key={skill} className="rounded-md bg-[#eef8f7] px-2.5 py-1 text-xs font-bold text-[#176b66]">{skill}</span>) : <span className="text-sm text-[#637b86]">Especialidades por completar</span>}
              </div>
              <p className="mt-3 text-sm leading-6 text-[#496471]">CV vivo con {profile.verifiedExperiences} experiencia(s) verificada(s) o referenciales visibles.</p>
            </div>
            <div className="flex flex-row gap-2 md:flex-col">
              <span className={`rounded-md px-3 py-1 text-center text-xs font-bold ${available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-[#637b86]"}`}>{available ? "Disponible" : "No disponible"}</span>
              <ButtonLink href={`/portal/profesionales/${profile.id}`}>Ver perfil</ButtonLink>
              <ButtonLink href={`/portal/mensajes?to=${profile.id}`} primary>Conectar</ButtonLink>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CompaniesList({ items, view }: { items: CompanyItem[]; view: ViewMode }) {
  if (!items.length) return <EmptyState text="No encontramos empresas con esos filtros." />;
  return (
    <div className={view === "grid" ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
      {items.map((company) => (
        <article key={company.id} className="rounded-xl border border-[#d4e4e2] bg-white p-5 shadow-[0_14px_36px_rgba(10,45,52,0.06)]">
          <Building2 className="h-7 w-7 text-primary" />
          <h2 className="mt-4 font-display text-xl font-bold text-[#0b202b]">{company.name}</h2>
          <p className="mt-1 text-sm text-[#496471]">{company.industry || "Empresa conectada"} {company.city ? `| ${company.city}` : ""}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={company.publicSlug ? `/portal/empresas/${company.publicSlug}` : "/portal/operaciones"}>Ver empresa</ButtonLink>
            <ButtonLink href="/portal/mensajes" primary>Contactar</ButtonLink>
          </div>
        </article>
      ))}
    </div>
  );
}

function GroupsList({ items, view }: { items: GroupItem[]; view: ViewMode }) {
  if (!items.length) return <EmptyState text="No hay grupos visibles en tus workspaces." />;
  return (
    <div className={view === "grid" ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
      {items.map((group) => (
        <article key={group.id} className="rounded-xl border border-[#d4e4e2] bg-white p-5 shadow-[0_14px_36px_rgba(10,45,52,0.06)]">
          <UserPlus className="h-7 w-7 text-primary" />
          <h2 className="mt-4 font-display text-xl font-bold text-[#0b202b]">{group.name}</h2>
          <p className="mt-2 text-sm leading-6 text-[#496471]">{group.purpose}</p>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-primary">{group.workspaceName} | {group.members} miembros</p>
        </article>
      ))}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-[#314b57]">
      {label}
      <select className="h-11 rounded-lg border border-[#d4e4e2] bg-white px-3 font-semibold text-[#496471]" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-[#d4e4e2] bg-white p-10 text-center text-[#637b86]">{text}</div>;
}

function ButtonLink({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link href={href} className={`inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-bold transition ${primary ? "border-primary bg-primary text-white hover:bg-[#00766f]" : "border-[#d4e4e2] bg-white text-[#314b57] hover:bg-[#f1f8f7]"}`}>
      {children}
    </Link>
  );
}
