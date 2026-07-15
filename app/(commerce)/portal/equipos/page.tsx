import Link from "next/link";
import { ArrowRight, MessageSquareText, UsersRound } from "lucide-react";
import { TeamComposer } from "@/components/terraqo/team-composer";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { ProfessionalPortalNav } from "@/components/terraqo/professional-portal-nav";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";
import { getTeamHub } from "@/lib/terraqo/teams";

export const dynamic = "force-dynamic";

export default async function ProfessionalTeamsPage() {
  const { session } = await requireProfessionalPortal();
  const data = await getTeamHub(session.user.id);

  return (
    <main className="min-h-screen bg-[#f4f8f8] py-8">
      <div className="container space-y-8">
        <ProfessionalPortalNav current="/portal/equipos" />
        <PortalPageHeading eyebrow="Colaboracion privada" title="Equipos Terraqo" description="Forma una dupla o squad con profesionales de tu workspace. Cada equipo tiene invitaciones controladas, conversacion grupal y acceso a Terraqo Meet." />
        {data.workspaces.length ? <TeamComposer workspaces={data.workspaces} colleagues={data.colleagues} projects={data.projects} /> : (
          <section className="rounded-lg border border-dashed bg-white p-8 text-center">
            <UsersRound className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-4 text-xl font-bold">Equipos aun no esta habilitado</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Tu workspace debe tener activos Equipos Terraqo y Mensajeria profesional.</p>
          </section>
        )}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.teams.map((team) => {
            const ownMembership = team.members.find((member) => member.userId === session.user.id);
            const activeCount = team.members.filter((member) => member.status === "ACTIVE").length;
            return (
              <Link key={team.id} href={`/portal/equipos/${team.id}`} className="group flex min-h-64 flex-col rounded-lg border bg-white p-6 shadow-technical transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl">
                <div className="flex items-start justify-between gap-4"><UsersRound className="h-6 w-6 text-primary" /><span className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase ${ownMembership?.status === "INVITED" ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary"}`}>{ownMembership?.status === "INVITED" ? "Invitacion" : "Activo"}</span></div>
                <h2 className="mt-8 font-display text-2xl font-bold leading-tight">{team.name}</h2>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{team.purpose}</p>
                <div className="mt-auto flex items-end justify-between gap-4 pt-6 text-xs text-muted-foreground">
                  <span>{activeCount} {activeCount === 1 ? "integrante activo" : "integrantes activos"}<br />{team.workspace.name}</span>
                  <ArrowRight className="h-5 w-5 text-primary transition group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
          {!data.teams.length && data.workspaces.length ? (
            <div className="rounded-lg border border-dashed bg-white p-8 md:col-span-2 xl:col-span-3"><MessageSquareText className="h-7 w-7 text-primary" /><h2 className="mt-4 text-xl font-bold">Tu primera colaboracion empieza aqui</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Crea un equipo, invita a un colega y define un objetivo concreto. La sala privada se prepara automaticamente.</p></div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
