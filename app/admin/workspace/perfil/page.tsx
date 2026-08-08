import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ExternalLink, Globe2 } from "lucide-react";
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
  services?: string[];
  differentiators?: string[];
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
          <h1 className="mt-2 font-display text-4xl font-bold text-[#082230]">Perfil vivo de empresa</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Crea la página pública empresarial del workspace: propuesta, servicios, diferenciales, cobertura y contacto. Es la versión empresa del CV vivo profesional.
          </p>
        </div>
        <Button asChild variant="outline"><Link href={`/empresas/${publicSlug}`} target="_blank">Ver página pública <ExternalLink className="h-4 w-4" /></Link></Button>
      </div>

      {params?.success === "profile" ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Perfil empresarial actualizado.</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Actualizar perfil</CardTitle>
            <CardDescription>Lo que cargues aquí alimenta el perfil público y las futuras vistas comerciales del workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateCompanyLiveProfileAction} className="grid gap-5">
              <label className="grid gap-2 text-sm font-semibold">
                Titular comercial
                <Input name="headline" defaultValue={profile.headline || ""} placeholder="Soluciones topográficas con precisión, tecnología y soporte real" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Extracto empresarial
                <Textarea name="summary" defaultValue={profile.summary || ""} placeholder="Resume experiencia, enfoque, cobertura y tipo de clientes. Este texto debe sentirse propio, no plantilla." />
              </label>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  Servicios principales
                  <Textarea name="services" defaultValue={(profile.services || []).join("\n")} placeholder={"Levantamientos topográficos\nEscaneo 3D y LiDAR\nControl de obra"} />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Diferenciales verificables
                  <Textarea name="differentiators" defaultValue={(profile.differentiators || []).join("\n")} placeholder={"Equipos calibrados\nReportes trazables\nSoporte técnico especializado"} />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold">
                Cobertura
                <Input name="coverage" defaultValue={profile.coverage || ""} placeholder="Lima, regiones del Perú y proyectos bajo coordinación" />
              </label>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  Correo comercial
                  <Input name="contactEmail" type="email" defaultValue={profile.contactEmail || ""} placeholder="ventas@empresa.com" />
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
          <Card className="bg-[#061722] text-white">
            <CardHeader>
              <Globe2 className="h-5 w-5 text-[#83efe2]" />
              <CardTitle>URL pública</CardTitle>
              <CardDescription className="text-white/65">Pensado para marca blanca y búsqueda comercial.</CardDescription>
            </CardHeader>
            <CardContent>
              <code className="block rounded-md border border-white/10 bg-white/8 p-3 text-sm text-[#83efe2]">terraqoglobal.com/empresas/{publicSlug}</code>
              <p className="mt-4 text-sm leading-6 text-white/62">Después podemos sumar alias por RUC o username y un dominio propio si el plan lo permite.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Perfil tipo CV vivo</CardTitle>
              <CardDescription>El siguiente paso natural es alimentar esta página automáticamente con proyectos publicados, equipo visible, evidencias y validaciones del workspace.</CardDescription>
            </CardHeader>
          </Card>
        </aside>
      </div>
    </section>
  );
}
