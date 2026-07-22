import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, Filter, Grid2X2, List, MapPin, Search, UserPlus, UsersRound } from "lucide-react";
import { UserAvatar } from "@/components/terraqo/user-avatar";
import { prisma } from "@/lib/prisma";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfessionalNetworkDirectoryPage() {
  const { session, memberships } = await requireProfessionalPortal();
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  const profiles = workspaceIds.length
    ? await prisma.terraqoProfessionalProfile.findMany({
        where: {
          userId: { not: session.user.id },
          user: { terraqoMemberships: { some: { workspaceId: { in: workspaceIds }, active: true } } }
        },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          affiliations: {
            where: { workspaceId: { in: workspaceIds } },
            include: { workspace: { select: { name: true, brandName: true } } },
            orderBy: [{ current: "desc" }, { updatedAt: "desc" }],
            take: 1
          },
          experiences: { where: { verifiedByTerraqo: true }, select: { id: true }, take: 8 }
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 80
      })
    : [];

  return (
    <div className="min-w-0 space-y-7 py-6 lg:py-8">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Red profesional</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-[#0b202b] md:text-5xl">Buscar profesionales</h1>
          <p className="mt-3 max-w-3xl text-[#496471]">Encuentra y conecta con profesionales, empresas y especialistas dentro de tus espacios autorizados.</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-3">
          <label className="relative block w-full min-w-[280px] sm:w-[430px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b818a]" />
            <input
              readOnly
              placeholder="Buscar profesionales, empresas, habilidades..."
              className="h-12 w-full rounded-lg border border-[#d4e4e2] bg-white pl-11 pr-4 text-sm font-medium text-[#496471] shadow-[0_12px_28px_rgba(15,59,67,0.05)]"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-grid overflow-hidden rounded-lg border border-[#d4e4e2] bg-white p-1 sm:grid-cols-3">
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-bold text-white"><UsersRound className="h-4 w-4" /> Profesionales</button>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-5 text-sm font-bold text-[#314b57]"><Building2 className="h-4 w-4" /> Empresas</button>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-5 text-sm font-bold text-[#314b57]"><UserPlus className="h-4 w-4" /> Grupos</button>
            </div>
            <div className="flex items-center gap-2">
              <select aria-label="Ordenar profesionales" className="h-10 rounded-lg border border-[#d4e4e2] bg-white px-3 text-sm font-semibold text-[#314b57]">
                <option>Mas relevantes</option>
                <option>Disponibles primero</option>
                <option>Mas recientes</option>
              </select>
              <button className="grid h-10 w-10 place-items-center rounded-lg border border-primary bg-primary text-white" aria-label="Vista en tarjetas"><Grid2X2 className="h-4 w-4" /></button>
              <button className="grid h-10 w-10 place-items-center rounded-lg border border-[#d4e4e2] bg-white text-[#496471]" aria-label="Vista en lista"><List className="h-4 w-4" /></button>
            </div>
          </div>

          <p className="text-sm font-bold text-[#314b57]">{profiles.length} profesionales encontrados</p>

          <div className="space-y-4">
            {profiles.map((profile) => {
              const workspace = profile.affiliations[0]?.workspace;
              const workspaceName = workspace?.brandName || workspace?.name || "Terraqo";
              const skills = [...profile.professionalCategories, ...profile.specialties].slice(0, 4);
              const available = ["AVAILABLE", "OPEN_TO_PROJECTS"].includes(profile.status);
              return (
                <article key={profile.id} className="grid gap-4 rounded-xl border border-[#d4e4e2] bg-white p-5 shadow-[0_14px_36px_rgba(10,45,52,0.06)] transition hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-[0_22px_48px_rgba(10,45,52,0.1)] md:grid-cols-[auto_minmax(0,1fr)_minmax(260px,0.9fr)_auto] md:items-center">
                  <div className="relative">
                    <UserAvatar name={profile.user.name} image={profile.user.image} size="xl" />
                    {available ? <span className="absolute bottom-2 right-2 h-4 w-4 rounded-full border-2 border-white bg-emerald-500" /> : null}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-xl font-bold text-[#0b202b]">{profile.user.name || "Profesional Terraqo"}</h2>
                    <p className="mt-1 font-bold text-primary">{profile.headline || "Perfil profesional"}</p>
                    <p className="mt-1 text-sm text-[#496471]">{workspaceName}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-[#637b86]"><MapPin className="h-4 w-4" /> {profile.city || "Ubicacion por confirmar"}</p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      {skills.length ? skills.map((skill) => <span key={skill} className="rounded-md bg-[#eef8f7] px-2.5 py-1 text-xs font-bold text-[#176b66]">{skill}</span>) : <span className="text-sm text-[#637b86]">Especialidades por completar</span>}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#496471]">{profile.bio || "Perfil en construccion dentro de la red profesional Terraqo."}</p>
                  </div>
                  <div className="flex flex-row gap-2 md:flex-col">
                    <span className={`rounded-md px-3 py-1 text-center text-xs font-bold ${available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-[#637b86]"}`}>{available ? "Disponible" : "No disponible"}</span>
                    <ButtonLink href={`/portal/profesionales/${profile.id}`}>Ver perfil</ButtonLink>
                    <ButtonLink href="/portal/mensajes" primary>Conectar</ButtonLink>
                  </div>
                </article>
              );
            })}
          </div>

          {!profiles.length ? (
            <div className="rounded-xl border border-dashed border-[#d4e4e2] bg-white p-10 text-center text-[#637b86]">Aun no hay otros profesionales vinculados a tus workspaces.</div>
          ) : null}
        </section>

        <aside className="h-fit rounded-xl border border-[#d4e4e2] bg-white p-5 shadow-[0_14px_36px_rgba(10,45,52,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-lg font-bold text-[#0b202b]">Filtros de busqueda</p>
            <button className="text-sm font-bold text-primary">Limpiar filtros</button>
          </div>
          <div className="mt-5 space-y-5">
            <FilterField label="Ubicacion" value="Todas las ubicaciones" />
            <FilterField label="Especialidad" value="Todas las especialidades" />
            <FilterField label="Disponibilidad" value="Disponible ahora" />
            <FilterField label="Experiencia" value="Cualquier experiencia" />
          </div>
          <button className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white">
            <Filter className="h-4 w-4" /> Aplicar filtros
          </button>
        </aside>
      </div>
    </div>
  );
}

function FilterField({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-[#314b57]">
      {label}
      <select className="h-11 rounded-lg border border-[#d4e4e2] bg-white px-3 font-semibold text-[#496471]" defaultValue={value}>
        <option>{value}</option>
      </select>
    </label>
  );
}

function ButtonLink({ href, children, primary = false }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-bold transition ${
        primary ? "border-primary bg-primary text-white hover:bg-[#00766f]" : "border-[#d4e4e2] bg-white text-[#314b57] hover:bg-[#f1f8f7]"
      }`}
    >
      {children}
    </Link>
  );
}
