import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ExternalLink, Globe2, Layers3 } from "lucide-react";
import { ClientLogoUploader } from "@/components/admin/client-logo-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateCompanyLiveProfileAction } from "@/lib/server/workspace-branding-actions";
import { prisma } from "@/lib/prisma";
import { getSessionTerraqoWorkspace } from "@/lib/terraqo/workspace-scope";

type PageProps = { searchParams?: Promise<{ success?: string }> };

type CompanyLiveProfile = {
  headline?: string;
  summary?: string;
  heroImageUrl?: string;
  services?: string[];
  differentiators?: string[];
  sectors?: string[];
  coverage?: string;
  contactEmail?: string;
  contactPhone?: string;
  publicEnabled?: boolean;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function companyProfile(settings: Prisma.JsonValue | null | undefined): CompanyLiveProfile {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const raw = (settings as Prisma.JsonObject).companyLiveProfile;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as CompanyLiveProfile;
}

export default async function WorkspaceCompanyProfilePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionWorkspace = await getSessionTerraqoWorkspace();
  const workspace = await prisma.terraqoWorkspace.findUnique({
    where: { id: sessionWorkspace.id },
    select: { id: true, slug: true, publicSlug: true, settings: true }
  });
  if (!workspace) throw new Error("Workspace no encontrado.");
  const profile = companyProfile(workspace.settings);
  const publicSlug = workspace.publicSlug || workspace.slug;

  return (
    <section className="space-y-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-primary">Workspace · Perfil de empresa</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-[#0e1a26]">Perfil vivo de empresa</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Construye una página empresarial con propuesta, sectores, servicios, diferenciales, cobertura y contacto. Es la versión empresa del CV vivo profesional.
          </p>
        </div>
        <Button asChild variant="outline"><Link href={`/empresas/${publicSlug}`} target="_blank">Ver página pública <ExternalLink className="h-4 w-4" /></Link></Button>
      </div>

      {params?.success === "profile" ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Perfil empresarial actualizado.</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Actualizar perfil</CardTitle>
            <CardDescription>Lo que cargues aquí alimenta el perfil público, directorios de empresa y futuras vistas comerciales del workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateCompanyLiveProfileAction} className="grid gap-5">
              <label className="grid gap-2 text-sm font-semibold">
                Titular comercial
                <Input name="headline" defaultValue={profile.headline || ""} placeholder="Servicios topográficos para levantar, controlar y documentar tu obra" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Extracto empresarial
                <Textarea name="summary" defaultValue={profile.summary || ""} placeholder="Describe experiencia, enfoque técnico, cobertura, tipo de clientes y forma de trabajo. Debe sentirse propio, no plantilla." />
              </label>
              <ClientLogoUploader
                initialLogoUrl={profile.heroImageUrl}
                inputName="heroImageUrl"
                label="Portada corporativa del perfil"
                description="Esta imagen se usa como background desenfocado de página y como fotografía nítida del hero. Terraqo aplica la paleta y capas de contraste automáticamente. Recomendado: 1920 × 900 px."
                emptyLabel="Aún no hay una portada corporativa cargada."
                previewClassName="h-28 w-52"
                previewImageClassName="object-cover"
              />
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  Servicios principales
                  <Textarea name="services" defaultValue={(profile.services || []).join("\n")} placeholder={"Levantamientos topográficos y geomática\nEscaneo 3D y tecnología LiDAR\nControl operativo de edificación e infraestructura"} />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Diferenciales verificables
                  <Textarea name="differentiators" defaultValue={(profile.differentiators || []).join("\n")} placeholder={"Equipos propios y calibrados\nAmplia red de profesionales\nCobertura nacional\nCompromiso con la calidad"} />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold">
                Sectores con los que trabaja
                <Textarea name="sectors" defaultValue={(profile.sectors || []).join("\n")} placeholder={"Infraestructura vial\nMinería y energía\nEdificación\nCatastro y saneamiento\nIndustria"} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Cobertura
                <Input name="coverage" defaultValue={profile.coverage || ""} placeholder="A nivel nacional, regiones del Perú y proyectos bajo coordinación" />
              </label>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  Correo comercial
                  <Input name="contactEmail" type="email" defaultValue={profile.contactEmail || ""} placeholder="proyectos@empresa.com" />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Teléfono / WhatsApp
                  <Input name="contactPhone" defaultValue={profile.contactPhone || ""} placeholder="+51 999 999 999" />
                </label>
              </div>
              <label className="flex items-start gap-3 rounded-md border bg-muted/35 p-4 text-sm font-semibold">
                <input name="publicEnabled" type="checkbox" defaultChecked={profile.publicEnabled !== false} className="mt-1 h-4 w-4" />
                <span>
                  Publicar perfil empresarial
                  <small className="mt-1 block font-normal text-muted-foreground">Si lo desactivas, la página pública no mostrará el perfil vivo aunque la marca blanca siga activa.</small>
                </span>
              </label>
              <div className="flex justify-end">
                <Button type="submit" className="min-w-52">Guardar perfil de empresa</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-5">
          <Card className="bg-[#0e1a26] text-white">
            <CardHeader>
              <Globe2 className="h-5 w-5 text-[#25c0d5]" />
              <CardTitle>URL pública</CardTitle>
              <CardDescription className="text-white/65">Pensado para marca blanca, posicionamiento comercial y directorios empresariales.</CardDescription>
            </CardHeader>
            <CardContent>
              <code className="block rounded-md border border-white/10 bg-white/8 p-3 text-sm text-[#25c0d5]">terraqoglobal.com/empresas/{publicSlug}</code>
              <p className="mt-4 text-sm leading-6 text-white/62">Luego puede evolucionar a alias por RUC, username empresarial o dominio propio según plan.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Layers3 className="h-5 w-5 text-primary" />
              <CardTitle>Perfil tipo CV vivo</CardTitle>
              <CardDescription>La página pública se alimenta con datos declarados, operación del workspace, profesionales vinculados, proyectos y evidencia visible.</CardDescription>
            </CardHeader>
          </Card>
        </aside>
      </div>
    </section>
  );
}
