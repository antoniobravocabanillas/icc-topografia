"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { UserAvatar } from "@/components/terraqo/user-avatar";

type PublicProfile = {
  id: string;
  username: string;
  name: string;
  image?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  country: string;
  status: string;
  yearsExperience?: number | null;
  categories: string[];
  specialties: string[];
  verified: boolean;
  visibleExperiences: number;
  verifiedExperiences: number;
  companyName?: string | null;
  roleTitle?: string | null;
  updatedAt: string;
};

const PAGE_SIZE = 12;

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function availabilityLabel(status: string) {
  if (status === "AVAILABLE") return "Disponible";
  if (status === "OPEN_TO_PROJECTS") return "Abierto a proyectos";
  if (status === "WORKING") return "En actividad";
  return "No disponible";
}

export function PublicNetworkDirectory({ profiles }: { profiles: PublicProfile[] }) {
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("all");
  const [location, setLocation] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [page, setPage] = useState(1);

  const specialtyOptions = useMemo(
    () => Array.from(new Set(profiles.flatMap((profile) => [...profile.categories, ...profile.specialties]).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [profiles]
  );
  const locationOptions = useMemo(
    () => Array.from(new Set(profiles.map((profile) => profile.location).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "es")),
    [profiles]
  );

  const filtered = useMemo(() => {
    const needle = normalized(query);
    return profiles.filter((profile) => {
      const skills = [...profile.categories, ...profile.specialties];
      const haystack = normalized([profile.name, profile.headline, profile.bio, profile.location, profile.companyName, profile.roleTitle, ...skills].filter(Boolean).join(" "));
      if (needle && !haystack.includes(needle)) return false;
      if (specialty !== "all" && !skills.includes(specialty)) return false;
      if (location !== "all" && profile.location !== location) return false;
      if (availability === "available" && !["AVAILABLE", "OPEN_TO_PROJECTS"].includes(profile.status)) return false;
      if (availability === "verified" && !profile.verified) return false;
      return true;
    });
  }, [availability, location, profiles, query, specialty]);

  useEffect(() => setPage(1), [availability, location, query, specialty]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleProfiles = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-[#f4f7f6] text-[#092b2a]">
      <section className="border-b border-[#dce6e2] bg-white">
        <div className="tq-public-wrap grid gap-10 py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:items-end lg:py-20">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#08746d]">Red operativa Terraqo</p>
            <h1 className="mt-5 max-w-3xl font-display text-5xl font-black leading-[0.98] tracking-[-0.045em] text-[#082d2b] sm:text-6xl">Encuentra capacidad demostrada, no solo perfiles.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#526562]">Profesionales que habilitaron su perfil descubrible, con una vista pública de sus especialidades y disponibilidad para colaborar.</p>
          </div>
          <div className="rounded-[20px] border border-[#cddbd6] bg-[#f8faf9] p-4 shadow-[0_20px_60px_rgba(8,45,43,0.07)] sm:p-6">
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-[#46615d]">Buscar en la red</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, especialidad, empresa o ubicación" className="h-14 w-full rounded-[10px] border border-[#bccdc7] bg-white px-4 text-base font-semibold text-[#153d39] outline-none transition placeholder:font-normal placeholder:text-[#81918e] focus:border-[#08746d] focus:ring-4 focus:ring-[#08746d]/10" />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Filter value={specialty} onChange={setSpecialty} label="Especialidad" options={[{ value: "all", label: "Todas" }, ...specialtyOptions.map((value) => ({ value, label: value }))]} />
              <Filter value={location} onChange={setLocation} label="Ubicación" options={[{ value: "all", label: "Todas" }, ...locationOptions.map((value) => ({ value, label: value }))]} />
              <Filter value={availability} onChange={setAvailability} label="Estado" options={[{ value: "all", label: "Todos" }, { value: "available", label: "Disponibles" }, { value: "verified", label: "Verificados" }]} />
            </div>
          </div>
        </div>
      </section>

      <section className="tq-public-wrap py-10 lg:py-14">
        <div className="mb-6 flex flex-col justify-between gap-3 border-b border-[#cddbd6] pb-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-black text-[#153d39]">{filtered.length} {filtered.length === 1 ? "perfil público" : "perfiles públicos"}</p>
            <p className="mt-1 text-sm text-[#657773]">Solo se incluyen profesionales con CV vivo y descubrimiento habilitado. Cada perfil conserva sus propios niveles de visibilidad.</p>
          </div>
          {(query || specialty !== "all" || location !== "all" || availability !== "all") ? <button type="button" onClick={() => { setQuery(""); setSpecialty("all"); setLocation("all"); setAvailability("all"); }} className="w-fit text-sm font-black text-[#08746d] underline decoration-[#87aaa3] underline-offset-4">Limpiar búsqueda</button> : null}
        </div>

        {visibleProfiles.length ? (
          <div className="divide-y divide-[#d6e1dd] border-y border-[#d6e1dd] bg-white">
            {visibleProfiles.map((profile) => <ProfileRow key={profile.id} profile={profile} />)}
          </div>
        ) : (
          <div className="border-y border-[#d6e1dd] bg-white px-6 py-16 text-center">
            <h2 className="font-display text-2xl font-black">No encontramos coincidencias</h2>
            <p className="mt-2 text-[#657773]">Prueba otra especialidad, ubicación o término de búsqueda.</p>
          </div>
        )}

        {pageCount > 1 ? (
          <nav className="mt-8 flex items-center justify-between gap-4" aria-label="Paginación de perfiles">
            <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-[8px] border border-[#b9cbc5] bg-white px-5 py-3 text-sm font-black text-[#153d39] disabled:cursor-not-allowed disabled:opacity-35">Anterior</button>
            <span className="text-sm font-bold text-[#657773]">Página {currentPage} de {pageCount}</span>
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-[8px] border border-[#b9cbc5] bg-white px-5 py-3 text-sm font-black text-[#153d39] disabled:cursor-not-allowed disabled:opacity-35">Siguiente</button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}

function ProfileRow({ profile }: { profile: PublicProfile }) {
  const skills = Array.from(new Set([...profile.categories, ...profile.specialties])).slice(0, 5);
  return (
    <article className="group p-5 transition hover:bg-[#f7faf8] sm:p-7">
      <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <UserAvatar name={profile.name} image={profile.image} size="lg" className="h-20 w-20 text-xl" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-black tracking-[-0.025em] text-[#092b2a]">{profile.name}</h2>
            {profile.verified ? <span className="rounded-full bg-[#dff4ea] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#07664e]">Verificado</span> : null}
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#52706a]"><i className={`h-2 w-2 rounded-full ${["AVAILABLE", "OPEN_TO_PROJECTS"].includes(profile.status) ? "bg-[#14a16d]" : "bg-[#93a39f]"}`} />{availabilityLabel(profile.status)}</span>
          </div>
          <p className="mt-1 font-bold text-[#08746d]">{profile.headline || profile.roleTitle || "Profesional Terraqo"}</p>
          <p className="mt-2 text-sm text-[#657773]">{[profile.companyName, profile.location, profile.country].filter(Boolean).join(" · ")}</p>
          {skills.length ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">{skills.map((skill) => <span key={skill} className="text-xs font-bold text-[#405954]">{skill}</span>)}</div> : null}
        </div>
        <div className="flex min-w-[190px] flex-row items-center justify-between gap-4 md:flex-col md:items-end">
          <p className="text-xs font-semibold text-[#657773]">{profile.verifiedExperiences} verificadas · {profile.visibleExperiences} visibles</p>
          <Link href={`/cv/${profile.username}`} className="inline-flex min-h-11 items-center justify-center rounded-[8px] bg-[#07534e] px-5 text-sm font-black text-white transition group-hover:bg-[#08746d]">Ver perfil completo</Link>
        </div>
      </div>
    </article>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-[8px] border border-[#c8d6d1] bg-white px-3 text-sm font-bold text-[#405954] outline-none focus:border-[#08746d]">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
