import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceVisualIdentity } from "@/lib/terraqo/workspace-visual-identity";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanyVerificationPage({ params }: PageProps) {
  const { slug } = await params;
  const workspace = await prisma.terraqoWorkspace.findFirst({
    where: { active: true, deletedAt: null, OR: [{ publicSlug: slug }, { slug }] },
    select: {
      name: true, brandName: true, logoUrl: true, industry: true, country: true, region: true,
      settings: true, createdAt: true,
      _count: { select: { projects: true, professionalAffiliations: { where: { verificationStatus: "VERIFIED", current: true } }, worklogs: true } }
    }
  });
  if (!workspace) notFound();

  const identity = resolveWorkspaceVisualIdentity(workspace.settings);
  const name = workspace.brandName || workspace.name;

  return (
    <main className="min-h-screen bg-[#f5f7f6] px-5 py-12 text-[#102b28]">
      <div className="mx-auto max-w-5xl">
        <Link href={`/empresas/${slug}`} className="text-sm font-black" style={{ color: identity.primaryColor }}>← Volver al perfil de empresa</Link>
        <section className="mt-8 overflow-hidden rounded-[28px] border border-[#dce4e1] bg-white shadow-[0_30px_100px_-60px_rgba(16,43,40,.35)]">
          <div className="p-8 text-white sm:p-12" style={{ background: `linear-gradient(135deg, ${identity.primaryColor}, #102b28)` }}>
            <p className="text-xs font-black uppercase tracking-[.16em]" style={{ color: identity.accentColor }}>Terraqo verified</p>
            <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 p-3"><TerraqoLogo src={workspace.logoUrl} variant="mark" alt={name} className="h-full w-full" imageClassName="object-contain" /></div>
              <div><h1 className="font-display text-4xl font-black">{name}</h1><p className="mt-2 text-white/70">{workspace.industry || "Empresa conectada a Terraqo"}</p></div>
              <BadgeCheck className="h-14 w-14 sm:ml-auto" style={{ color: identity.accentColor }} />
            </div>
          </div>
          <div className="p-8 sm:p-12">
            <h2 className="font-display text-3xl font-black">Perfil empresarial verificado</h2>
            <p className="mt-4 max-w-3xl leading-7 text-[#5b6f69]">Terraqo confirma que este workspace mantiene una identidad empresarial activa y una operación documentada dentro de la plataforma. La verificación respalda la trazabilidad del perfil; no sustituye certificaciones legales, técnicas o regulatorias emitidas por terceros.</p>
            <div className="mt-9 grid gap-4 sm:grid-cols-3">
              <VerificationDatum value={workspace._count.projects} label="Proyectos registrados" />
              <VerificationDatum value={workspace._count.professionalAffiliations} label="Profesionales vinculados" />
              <VerificationDatum value={workspace._count.worklogs} label="Registros operativos" />
            </div>
            <div className="mt-9 border-t border-[#e2e8e5] pt-7 text-sm text-[#536762]"><p><strong>Estado:</strong> Verificado</p><p className="mt-2"><strong>País:</strong> {workspace.country}{workspace.region ? ` · ${workspace.region}` : ""}</p><p className="mt-2"><strong>Workspace activo desde:</strong> {workspace.createdAt.toLocaleDateString("es-PE", { year: "numeric", month: "long" })}</p></div>
          </div>
        </section>
      </div>
    </main>
  );
}

function VerificationDatum({ value, label }: { value: number; label: string }) {
  return <div className="rounded-2xl border border-[#dfe6e3] bg-[#f7f9f8] p-5"><strong className="font-display text-3xl font-black">{value}</strong><span className="mt-2 block text-sm font-semibold text-[#60736e]">{label}</span></div>;
}
