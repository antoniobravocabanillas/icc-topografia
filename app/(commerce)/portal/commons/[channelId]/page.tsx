import Link from "next/link";
import { ArrowRight, LockKeyhole, MessageCircleMore, Pin, UsersRound } from "lucide-react";
import { ForumPostComposer } from "@/components/terraqo/forum-post-composer";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { ProfessionalPortalNav } from "@/components/terraqo/professional-portal-nav";
import { getForumChannelForUser } from "@/lib/terraqo/forums";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const date = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" });

export default async function ForumChannelPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const { session } = await requireProfessionalPortal();
  const { channel } = await getForumChannelForUser(session.user.id, channelId);

  return (
    <section className="bg-[#f6fbff] py-10 md:py-14">
      <div className="container space-y-8">
        <ProfessionalPortalNav current="/portal/commons" />
        <nav aria-label="Ruta de Commons" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href="/portal/commons" className="hover:text-primary">Commons</Link><span>/</span><span className="text-foreground">{channel.name}</span>
        </nav>
        <PortalPageHeading
          eyebrow={channel.workspace?.brandName || channel.workspace?.name || "Terraqo Commons"}
          title={channel.name}
          description={channel.description || "Un canal para intercambiar criterios, procesos y soluciones basadas en trabajo real."}
          action={<span className="inline-flex items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4 text-primary" />{channel.visibility === "WORKSPACE" || channel.visibility === "PRIVATE" ? "Solo workspace" : "Comunidad Terraqo"}</span>}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <ForumPostComposer channelId={channel.id} />
            {channel.posts.map((post) => (
              <Link key={post.id} href={`/portal/commons/${channel.id}/${post.id}`} className="group block rounded-lg border bg-white p-5 shadow-technical transition hover:-translate-y-0.5 hover:border-primary/40">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">{post.pinned ? <><Pin className="h-3.5 w-3.5" /> Destacado</> : "Conversacion tecnica"}</div>
                    <h2 className="mt-2 font-display text-xl font-bold leading-snug group-hover:text-primary md:text-2xl">{post.title}</h2>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{post.body}</p>
                  </div>
                  <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-primary transition group-hover:translate-x-1" />
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{post.author?.name || "Profesional Terraqo"}</span>
                  <span>{date.format(post.updatedAt)}</span>
                  <span className="inline-flex items-center gap-1"><MessageCircleMore className="h-3.5 w-3.5" />{post._count.replies} respuestas</span>
                </div>
              </Link>
            ))}
            {!channel.posts.length ? <div className="rounded-lg border border-dashed bg-white p-10 text-center"><MessageCircleMore className="mx-auto h-8 w-8 text-primary" /><p className="mt-3 font-semibold">Abre la primera conversacion de este canal.</p><p className="mt-1 text-sm text-muted-foreground">Una pregunta concreta puede activar conocimiento valioso.</p></div> : null}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-lg bg-[#03111D] p-6 text-white shadow-xl"><UsersRound className="h-6 w-6 text-[#24C8EE]" /><h2 className="mt-4 font-display text-2xl font-bold">El trabajo habla.</h2><p className="mt-3 text-sm leading-6 text-white/65">Describe el contexto, comparte el criterio aplicado y evita datos confidenciales de clientes o proyectos.</p></div>
            <Link href="/portal/mensajes" className="flex items-center justify-between rounded-lg border bg-white p-5 font-semibold hover:border-primary/40"><span>Continuar en privado</span><ArrowRight className="h-4 w-4 text-primary" /></Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
