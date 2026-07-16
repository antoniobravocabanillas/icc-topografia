import Link from "next/link";
import { BadgeCheck, MessageCircleMore, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ForumReplyForm } from "@/components/terraqo/forum-reply-form";
import { startConversationAction } from "@/lib/terraqo/messaging-actions";
import { getForumPostForUser } from "@/lib/terraqo/forums";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const date = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Author({ author }: { author: { id: string; name: string | null; terraqoProfessionalProfile: { id: string; headline: string | null; identityVerificationStatus: string } | null } | null }) {
  if (!author) return <span>Profesional Terraqo</span>;
  const content = <><span className="font-semibold">{author.name || "Profesional Terraqo"}</span>{author.terraqoProfessionalProfile?.identityVerificationStatus === "VERIFIED" ? <BadgeCheck className="h-4 w-4 text-primary" /> : null}</>;
  return author.terraqoProfessionalProfile ? <Link href={`/portal/profesionales/${author.terraqoProfessionalProfile.id}`} className="inline-flex items-center gap-1.5 hover:text-primary">{content}</Link> : <span className="inline-flex items-center gap-1.5">{content}</span>;
}

export default async function ForumPostPage({ params }: { params: Promise<{ channelId: string; postId: string }> }) {
  const { channelId, postId } = await params;
  const { session } = await requireProfessionalPortal();
  const { channel, post } = await getForumPostForUser(session.user.id, channelId, postId);
  const messageAction = startConversationAction.bind(null, "/portal/mensajes");

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
        <nav aria-label="Ruta de Commons" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Link href="/portal/commons" className="hover:text-primary">Commons</Link><span>/</span><Link href={`/portal/commons/${channel.id}`} className="hover:text-primary">{channel.name}</Link><span>/</span><span className="max-w-72 truncate text-foreground">{post.title}</span></nav>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <main className="space-y-5">
            <article className="rounded-lg border bg-white p-6 shadow-technical md:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Conversacion tecnica</p>
              <h1 className="mt-3 max-w-4xl font-display text-3xl font-bold leading-tight md:text-5xl">{post.title}</h1>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-4 text-sm text-muted-foreground"><Author author={post.author} /><span>{date.format(post.createdAt)}</span><span>{post.replies.length} respuestas</span></div>
              <p className="mt-7 whitespace-pre-wrap text-base leading-8 text-foreground/85">{post.body}</p>
              {post.tags.length ? <div className="mt-7 flex flex-wrap gap-2">{post.tags.map((tag) => <span key={tag} className="rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">#{tag}</span>)}</div> : null}
            </article>

            <section className="space-y-4" aria-labelledby="responses-title">
              <div className="flex items-center gap-2"><MessageCircleMore className="h-5 w-5 text-primary" /><h2 id="responses-title" className="font-display text-2xl font-bold">Respuestas</h2></div>
              {post.replies.map((reply) => <article key={reply.id} className="rounded-lg border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><Author author={reply.author} /><time className="text-xs text-muted-foreground">{date.format(reply.createdAt)}</time></div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground/80">{reply.body}</p></article>)}
              {!post.replies.length ? <p className="rounded-lg border border-dashed bg-white p-6 text-sm text-muted-foreground">Todavia no hay respuestas. Puedes aportar el primer criterio tecnico.</p> : null}
              <ForumReplyForm postId={post.id} />
            </section>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-lg border bg-white p-5"><UserRound className="h-5 w-5 text-primary" /><h2 className="mt-3 font-display text-xl font-bold">Conecta con criterio</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Si el intercambio requiere datos privados o coordinación, continúa la conversación en Mensajes.</p>{post.authorId && post.authorId !== session.user.id && channel.workspaceId ? <form action={messageAction} className="mt-4"><input type="hidden" name="recipientUserId" value={post.authorId} /><input type="hidden" name="workspaceId" value={channel.workspaceId} /><Button type="submit" className="w-full">Enviar mensaje privado</Button></form> : <Button asChild variant="outline" className="mt-4 w-full"><Link href="/portal/mensajes">Abrir Mensajes</Link></Button>}</div>
            <div className="rounded-lg bg-[#03111D] p-5 text-sm leading-6 text-white/70"><strong className="block text-white">Canal: {channel.name}</strong><span className="mt-2 block">{channel.description || "Intercambio profesional basado en experiencia real."}</span></div>
          </aside>
        </div>
    </div>
  );
}
