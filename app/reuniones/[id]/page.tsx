import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, UsersRound, Video } from "lucide-react";
import { auth } from "@/auth";
import { MeetingRoom } from "@/components/terraqo/meeting-room";
import { Button } from "@/components/ui/button";
import { endMeetingAction } from "@/lib/terraqo/meet-actions";
import { getMeetingForUser, getMeetProviderConfig, safeMeetReturnPath } from "@/lib/terraqo/meet";

export const dynamic = "force-dynamic";

export default async function TerraqoMeetingPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const query = await searchParams;
  const returnPath = safeMeetReturnPath(query.volver);
  if (!session?.user?.id) redirect(`/cuenta?callbackUrl=${encodeURIComponent(`/reuniones/${id}`)}`);

  const meeting = await getMeetingForUser(id, session.user.id).catch(() => null);
  if (!meeting) redirect(`${returnPath}?error=reunion-no-autorizada`);

  const provider = getMeetProviderConfig();
  const endAction = endMeetingAction.bind(null, returnPath, meeting.id);
  const canEnd = meeting.createdById === session.user.id
    || meeting.conversation.participants.some((participant) => participant.userId === session.user.id && ["OWNER", "MODERATOR"].includes(participant.role));

  return (
    <main className="flex min-h-screen flex-col bg-[#061c1f] text-white md:h-screen md:overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={returnPath} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/15 transition hover:border-[#58ddd4] hover:text-[#58ddd4]" title="Volver a mensajes">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#58ddd4]"><Video className="h-4 w-4" /> Terraqo Meet</p>
            <h1 className="truncate font-display text-base font-bold sm:text-lg">{meeting.title || "Reunion de trabajo"}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 text-xs text-white/65 sm:flex"><UsersRound className="h-4 w-4" /> {meeting.participants.length} invitados</span>
          {canEnd ? <form action={endAction}><Button type="submit" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">Finalizar reunion</Button></form> : null}
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-white/10 bg-white/5 px-4 py-2 text-xs text-white/65 sm:px-6">
        <span className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-[#58ddd4]" /> {meeting.workspace.name}</span>
        {meeting.project ? <span>Proyecto: {meeting.project.title}</span> : <span>Conversacion profesional</span>}
        <span className="ml-auto font-mono text-[#58ddd4]">Sala privada</span>
      </div>
      <MeetingRoom
        meetingId={meeting.id}
        roomName={meeting.roomKey}
        domain={provider.domain}
        scriptUrl={provider.scriptUrl}
        displayName={session.user.name || meeting.participants.find((participant) => participant.userId === session.user.id)?.user.name || "Participante Terraqo"}
        email={session.user.email || ""}
        returnPath={returnPath}
      />
    </main>
  );
}
