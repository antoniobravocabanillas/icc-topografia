import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Palette, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClientLogoUploader } from "@/components/admin/client-logo-uploader";
import { updateWorkspaceBrandingAction } from "@/lib/server/workspace-branding-actions";
import { prisma } from "@/lib/prisma";
import { getSessionTerraqoWorkspace } from "@/lib/terraqo/workspace-scope";

type PageProps = { searchParams?: Promise<{ success?: string; error?: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkspaceBrandingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionWorkspace = await getSessionTerraqoWorkspace();
  const workspace = await prisma.terraqoWorkspace.findUnique({
    where: { id: sessionWorkspace.id },
    select: { id: true, slug: true, name: true, brandName: true, publicSlug: true, domain: true, logoUrl: true, industry: true, description: true }
  });
  if (!workspace) throw new Error("Workspace no encontrado.");
  const publicSlug = workspace.publicSlug || workspace.slug;
  const publicUrl = `/empresas/${publicSlug}`;

  return (
    <section className="space-y-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-primary">Workspace · Marca blanca</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-[#082230]">Personalización de marca</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Define cómo se verá este workspace cuando clientes, profesionales y equipos ingresen por Terraqo. Esta identidad se consume en portal, perfil público y módulos conectados.
          </p>
        </div>
        <Button asChild variant="outline"><Link href={publicUrl} target="_blank">Ver perfil público <ExternalLink className="h-4 w-4" /></Link></Button>
      </div>

      {params?.success === "brand" ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Marca blanca actualizada.</div> : null}
      {params?.error === "slug" ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">Ese usuario/slug público ya está siendo usado por otro workspace.</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Identidad visible del workspace</CardTitle>
            <CardDescription>Estos datos son la capa de marca blanca para portal, tienda conectada y perfil empresarial.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateWorkspaceBrandingAction} className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Marca visible
                <Input name="brandName" defaultValue={workspace.brandName || workspace.name} placeholder="ICC Topografía" required />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Usuario o slug público
                <Input name="publicSlug" defaultValue={publicSlug} placeholder="icc-topografia" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Rubro principal
                <Input name="industry" defaultValue={workspace.industry || ""} placeholder="Topografía, ingeniería, construcción..." />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Dominio web
                <Input name="domain" defaultValue={workspace.domain || ""} placeholder="icctopografia.com" />
              </label>
              <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                Descripción corta
                <Textarea name="description" defaultValue={workspace.description || ""} placeholder="Describe la empresa en 2 o 3 líneas comerciales, sin sonar genérico." />
              </label>
              <ClientLogoUploader initialLogoUrl={workspace.logoUrl} inputName="logoUrl" label="Logo del workspace" description="Este logo se usará en el portal marca blanca y en el perfil público de empresa." />
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" className="min-w-52">Guardar marca blanca</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-5">
          <Card className="overflow-hidden">
            <div className="bg-[#062f38] p-5 text-white">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#83efe2]">Preview</p>
              <div className="mt-5 flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-xl bg-white/95 p-2 text-[#06343b]">
                  {workspace.logoUrl ? <Image src={workspace.logoUrl} alt="Logo del workspace" width={96} height={96} className="max-h-12 w-auto object-contain" unoptimized /> : <span className="font-black">TQ</span>}
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold">{workspace.brandName || workspace.name}</h2>
                  <p className="text-sm text-white/62">{workspace.industry || "Rubro por configurar"}</p>
                </div>
              </div>
            </div>
            <CardContent className="pt-5">
              <div className="flex items-start gap-3 rounded-md bg-[#edf8f6] p-4 text-sm text-[#21484e]">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>La marca blanca debe ser única por workspace. No duplica datos: solo cambia la capa visible del mismo portal Terraqo.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Palette className="h-5 w-5 text-primary" />
              <CardTitle>Próxima capa</CardTitle>
              <CardDescription>Color principal, tipografía y piezas visuales por workspace pueden entrar aquí sin tocar cada módulo manualmente.</CardDescription>
            </CardHeader>
          </Card>
        </aside>
      </div>
    </section>
  );
}
