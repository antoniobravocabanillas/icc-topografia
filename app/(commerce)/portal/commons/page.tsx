import Link from "next/link";
import { ArrowRight, Building2, MessagesSquare, UsersRound } from "lucide-react";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { WorklogCard } from "@/components/terraqo/worklog-card";
import { prisma } from "@/lib/prisma";
import { getVisibleForumChannels } from "@/lib/terraqo/forums";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";
import { getVisibleWorklogs } from "@/lib/terraqo/worklog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CommonsPage() {
  const { session } = await requireProfessionalPortal();
  const result = await getVisibleWorklogs(session.user.id, 40);
  const worklogs = result.worklogs.filter((worklog) => worklog.visibility !== "PRIVATE");
  const workspaceIds = Array.from(new Set([
    ...result.memberships.map((membership) => membership.workspaceId),
    ...worklogs.flatMap((worklog) => worklog.workspaceId ? [worklog.workspaceId] : [])
  ]));

  const [companies, forumResult] = await Promise.all([
    prisma.terraqoWorkspace.findMany({
      where: { id: { in: workspaceIds }, active: true, deletedAt: null, modules: { some: { code: "PROFESSIONAL_NETWORK", active: true } } },
      select: {
        id: true, slug: true, name: true, brandName: true, logoUrl: true, industry: true, description: true,
        _count: { select: { projects: true, jobPosts: true, professionalAffiliations: true } }
      },
      orderBy: { name: "asc" }
    }),
    getVisibleForumChannels(session.user.id)
  ]);
  const channels = forumResult.channels.slice(0, 8);

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
        <PortalPageHeading eyebrow="Terraqo Commons" title="Conocimiento de quienes hacen." description="Un espacio profesional basado en evidencia: trabajo real, empresas activas y conversaciones que ayudan a resolver mejor." />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            {worklogs.map((worklog) => <WorklogCard key={worklog.id} worklog={worklog} viewerId={session.user.id} />)}
            {!worklogs.length ? <div className="rounded-lg border bg-white p-8 text-center text-muted-foreground">El feed se activa cuando los profesionales comparten evidencia con la comunidad.</div> : null}
          </div>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-lg border bg-white p-5 shadow-technical">
              <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-bold">Empresas conectadas</h2></div>
              <div className="mt-4 space-y-2">
                {companies.map((company) => (
                  <Link key={company.id} href={`/portal/empresas/${company.slug}`} className="group flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/50">
                    <div><strong className="block text-sm">{company.brandName || company.name}</strong><span className="text-xs text-muted-foreground">{company.industry || "Empresa Terraqo"}</span></div>
                    <ArrowRight className="h-4 w-4 text-primary transition group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-[#03111D] p-5 text-white shadow-xl">
              <div className="flex items-center gap-2"><MessagesSquare className="h-5 w-5 text-[#24C8EE]" /><h2 className="font-display text-xl font-bold">Gremios y foros</h2></div>
              <p className="mt-2 text-sm text-white/65">Conversaciones tecnicas organizadas por rubro y especialidad.</p>
              <div className="mt-4 space-y-1">{channels.map((channel) => <Link key={channel.id} href={`/portal/commons/${channel.id}`} className="group flex items-center justify-between gap-3 border-t border-white/10 py-3 text-sm"><span><strong className="block text-white group-hover:text-[#7DE4FF]">{channel.name}</strong><span className="mt-0.5 block text-xs text-white/45">{channel.posts[0]?.title || "Abre la primera conversacion"}</span></span><span className="shrink-0 text-[#7DE4FF]">{channel._count.posts}</span></Link>)}</div>
              {!channels.length ? <p className="mt-4 text-sm text-white/60">Los primeros gremios se habilitaran desde el panel Terraqo.</p> : null}
            </div>

            <div className="flex items-start gap-3 rounded-lg border bg-white p-5"><UsersRound className="mt-1 h-5 w-5 text-primary" /><p className="text-sm leading-6 text-muted-foreground">Commons evita el ruido: prioriza evidencia, aportes tecnicos y conexiones vinculadas al trabajo.</p></div>
          </aside>
        </div>
    </div>
  );
}
