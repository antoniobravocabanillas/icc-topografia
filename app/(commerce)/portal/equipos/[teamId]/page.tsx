import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, MessageSquareText, UserRoundCheck, UsersRound, Video } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TeamInvitationActions } from "@/components/terraqo/team-invitation-actions";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";
import { getTeamForUser, TerraqoTeamError } from "@/lib/terraqo/teams";

export const dynamic = "force-dynamic";

export default async function ProfessionalTeamDetailPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { session } = await requireProfessionalPortal();
  const { teamId } = await params;
  let team;
  try {
    team = await getTeamForUser(session.user.id, teamId);
  } catch (error) {
    if (error instanceof TerraqoTeamError && error.status === 404) notFound();
    throw error;
  }
  const ownMembership = team.members.find((member) => member.userId === session.user.id);
  const isActive = ownMembership?.status === "ACTIVE";

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
        <Link href="/portal/equipos" className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" /> Volver a equipos</Link>
        <PortalPageHeading eyebrow={`${team.workspace.name} / Equipo privado`} title={team.name} description={team.purpose} action={isActive && team.conversationId ? <Button asChild><Link href={`/portal/mensajes?conversation=${team.conversationId}`}><MessageSquareText className="mr-2 h-4 w-4" /> Abrir sala</Link></Button> : undefined} />
        {ownMembership?.status === "INVITED" ? (
          <section className="grid gap-6 rounded-lg border border-amber-200 bg-amber-50 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">Invitacion pendiente</p><h2 className="mt-2 text-xl font-bold">{team.owner.name || team.owner.email} te invito a colaborar</h2><p className="mt-2 text-sm leading-6 text-amber-900/70">Al aceptar entraras a la sala grupal y podras participar en mensajes y reuniones del equipo.</p></div>
            <TeamInvitationActions teamId={team.id} />
          </section>
        ) : null}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-lg border bg-white p-6 shadow-technical">
            <div className="flex items-center gap-3"><UsersRound className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Personas del equipo</h2></div>
            <div className="mt-6 divide-y">
              {team.members.filter((member) => member.status !== "DECLINED" && member.status !== "REMOVED").map((member) => (
                <div key={member.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 font-bold text-primary">{(member.user.name || member.user.email).slice(0, 1).toUpperCase()}</div><div><p className="font-semibold">{member.user.name || member.user.email}</p><p className="text-xs text-muted-foreground">{member.user.terraqoProfessionalProfile?.headline || "Profesional Terraqo"}</p></div></div>
                  <span className={`w-fit rounded-md px-2 py-1 text-[11px] font-bold uppercase ${member.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{member.role === "OWNER" ? "Responsable" : member.status === "ACTIVE" ? "Integrante" : "Invitado"}</span>
                </div>
              ))}
            </div>
          </div>
          <aside className="space-y-4">
            <div className="rounded-lg border bg-[#062f34] p-6 text-white shadow-technical"><UserRoundCheck className="h-6 w-6 text-[#5de0d5]" /><p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#5de0d5]">Responsable</p><p className="mt-2 text-lg font-bold">{team.owner.name || team.owner.email}</p></div>
            {team.project ? <div className="rounded-lg border bg-white p-6"><BriefcaseBusiness className="h-5 w-5 text-primary" /><p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-primary">Proyecto vinculado</p><p className="mt-2 font-semibold">{team.project.title}</p></div> : null}
            <div className="rounded-lg border bg-white p-6"><Video className="h-5 w-5 text-primary" /><p className="mt-4 font-semibold">Mensajes y Terraqo Meet</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Cuando aceptas la invitacion, la sala del equipo aparece en Mensajes. Desde alli pueden iniciar una videollamada.</p></div>
          </aside>
        </section>
    </div>
  );
}
