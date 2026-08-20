import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, CreditCard, MessageCircle, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { updateProfessionalSettingsAction } from "@/lib/server/professional-actions";
import { createMetadata } from "@/lib/seo";
import { terraqoDomains } from "@/lib/terraqo-domains";

export const metadata = createMetadata({
  title: "Configuracion del perfil profesional",
  description: "Privacidad, perfil público, mensajes y datos de cobro del Portal Terraqo.",
  path: "/portal/configuracion"
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SettingsPageProps = {
  searchParams: Promise<{ success?: string; status?: string }>;
};

const statusMessages: Record<string, string> = {
  "username-invalid": "El usuario debe tener 3 a 30 caracteres: letras minusculas, numeros, punto, guion o guion bajo.",
  "username-taken": "Ese usuario ya esta en uso. Elige otra variante."
};

const socialOptions = [
  ["WEB", "Sitio web"],
  ["LINKEDIN", "LinkedIn"],
  ["GITHUB", "GitHub"],
  ["INSTAGRAM", "Instagram"],
  ["FACEBOOK", "Facebook"],
  ["YOUTUBE", "YouTube"],
  ["TIKTOK", "TikTok"],
  ["X", "X / Twitter"],
  ["BEHANCE", "Behance"],
  ["DRIBBBLE", "Dribbble"],
  ["WHATSAPP", "WhatsApp"],
  ["OTHER", "Otro"]
];

const socialVisibilityOptions = [
  ["PUBLIC", "Publico"],
  ["COMMUNITY", "Red Terraqo"],
  ["WORKSPACE", "Contactos / workspace"],
  ["PRIVATE", "Privado"]
];

export default async function PortalSettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      user: { select: { name: true, email: true, image: true } },
      experiences: {
        where: { currentlyWorking: true },
        select: { id: true, title: true, companyName: true, role: true, startedAt: true },
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        take: 12
      },
      socialLinks: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], take: 8 }
    }
  });

  if (!profile) redirect("/portal?status=profile-required");

  const publicCvHref = profile.username ? `${terraqoDomains.public}/cv/${profile.username}` : null;

  return (
    <div className="min-w-0 py-8 lg:py-10">
      <div className="mx-auto max-w-6xl space-y-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-primary">Configuración profesional</p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0e1a26] lg:text-5xl">Tu perfil, tus permisos y tus datos privados.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#4a6570]">
              Controla como te encuentran, quien puede escribirte y que información operativa pueden ver las empresas con las que trabajas.
            </p>
          </div>
          <Card className="border-primary/20 bg-[#eaf8f6]">
            <CardContent className="p-5">
              <div className="flex gap-3">
                <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-6 text-[#254751]">
                  Los datos bancarios y de contacto se usan para operaciones vinculadas a tus proyectos. Terraqo no los muestra en tu CV público.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {params.success === "settings" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Configuración guardada correctamente.
          </div>
        ) : null}
        {params.status && statusMessages[params.status] ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {statusMessages[params.status]}
          </div>
        ) : null}

        <form action={updateProfessionalSettingsAction} className="grid gap-6">
          <Card>
            <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-primary"><UserRound className="h-5 w-5" /><span className="font-mono text-xs font-bold uppercase tracking-[0.16em]">Perfil público</span></div>
                <CardTitle className="mt-3">Usuario y CV vivo</CardTitle>
                <CardDescription>Define un enlace corto para compartir tu perfil profesional validado.</CardDescription>
              </div>
              {publicCvHref ? (
                <Button asChild variant="outline">
                  <Link href={publicCvHref} target="_blank">Ver CV público</Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Nombre de usuario</span>
                <Input name="username" defaultValue={profile.username || ""} placeholder="ej. antonio-bravo" />
              </label>
              <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                {publicCvHref ? (
                  <span><b className="text-foreground">Enlace activo:</b> {publicCvHref.replace(/^https?:\/\//, "")}</span>
                ) : (
                  <span>Crea un usuario para activar tu enlace público. Tu CV vivo solo muestra información profesional permitida.</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-primary"><MessageCircle className="h-5 w-5" /><span className="font-mono text-xs font-bold uppercase tracking-[0.16em]">Redes y presencia digital</span></div>
              <CardTitle>Enlaces visibles en tu CV vivo</CardTitle>
              <CardDescription>Elige plataforma, pega el enlace y define privacidad. El CV publico solo mostrara los enlaces marcados como publicos.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {Array.from({ length: 5 }).map((_, index) => {
                const link = profile.socialLinks[index];
                return (
                  <div key={index} className="grid gap-3 rounded-lg border bg-[#f8fcfb] p-3 lg:grid-cols-[190px_1fr_190px]">
                    <label className="grid gap-1">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Canal</span>
                      <select name="socialPlatform" defaultValue={link?.platform || (index === 0 ? "WEB" : "")} className="h-11 rounded-md border bg-background px-3 text-sm">
                        <option value="">Sin enlace</option>
                        {socialOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Enlace</span>
                      <Input name="socialUrl" defaultValue={link?.url || ""} placeholder="https://linkedin.com/in/usuario" />
                      <Input name="socialLabel" defaultValue={link?.label || ""} placeholder="Etiqueta opcional. Ej. Portafolio tecnico" className="mt-1" />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Privacidad</span>
                      <select name="socialVisibility" defaultValue={link?.visibility || "PUBLIC"} className="h-11 rounded-md border bg-background px-3 text-sm">
                        {socialVisibilityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-primary"><BadgeCheck className="h-5 w-5" /><span className="font-mono text-xs font-bold uppercase tracking-[0.16em]">Presentación pública</span></div>
              <CardTitle>Título, resumen y capacidades visibles</CardTitle>
              <CardDescription>Esto alimenta tu perfil dentro del workspace y también tu CV público. Evita textos genéricos: escribe como quieres que te vea una empresa.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Usar trabajo actual como título principal</span>
                <select name="featuredCurrentExperienceId" defaultValue="" className="h-11 rounded-md border bg-background px-3 text-sm">
                  <option value="">No usar automáticamente; escribir título manual</option>
                  {profile.experiences.map((experience) => (
                    <option key={experience.id} value={experience.id}>
                      {(experience.role || experience.title)}{experience.companyName ? ` - ${experience.companyName}` : ""} (actualmente)
                    </option>
                  ))}
                </select>
                <small className="text-xs leading-5 text-muted-foreground">Ejemplo: Gerente General - VRILLA SAC (actualmente). Si eliges uno, reemplaza el título manual.</small>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Título profesional manual</span>
                <Input name="headline" defaultValue={profile.headline || ""} placeholder="Ej. Gerente General - VRILLA SAC / Especialista en control topográfico" maxLength={140} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Resumen profesional público</span>
                <Textarea name="bio" defaultValue={profile.bio || ""} placeholder="Describe en primera persona tu enfoque, experiencia clave, tipo de proyectos y valor profesional. Este texto será visible en tu CV público." className="min-h-36" maxLength={900} />
                <small className="text-xs leading-5 text-muted-foreground">Este texto reemplaza el extracto automático como fuente principal del CV. La IA puede sugerir, pero tú decides qué se publica.</small>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">Áreas profesionales</span>
                  <Textarea name="professionalCategories" defaultValue={profile.professionalCategories.join(", ")} placeholder="Topografía, gestión de obra, operaciones, dirección técnica" className="min-h-24" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">Habilidades principales</span>
                  <Textarea name="specialties" defaultValue={profile.specialties.join(", ")} placeholder="Control altimétrico, replanteo, GNSS, liderazgo de cuadrillas" className="min-h-24" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">Equipos dominados</span>
                  <Textarea name="equipment" defaultValue={profile.equipment.join(", ")} placeholder="Estación total, nivel automático, GNSS RTK, dron" className="min-h-24" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">Software y herramientas</span>
                  <Textarea name="software" defaultValue={profile.software.join(", ")} placeholder="Civil 3D, AutoCAD, Excel avanzado, QGIS" className="min-h-24" />
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-primary"><MessageCircle className="h-5 w-5" /><span className="font-mono text-xs font-bold uppercase tracking-[0.16em]">Mensajes y red</span></div>
              <CardTitle>Quien puede contactarte</CardTitle>
              <CardDescription>Terraqo funciona como una red profesional. Puedes abrirte a oportunidades o limitar mensajes a empresas vinculadas.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Permisos de mensajes</span>
                <select name="messagePrivacy" defaultValue={profile.messagePrivacy} className="h-11 rounded-md border bg-background px-3 text-sm">
                  <option value="EVERYONE">Cualquier perfil de Terraqo</option>
                  <option value="WORKSPACE">Solo empresas y equipos vinculados</option>
                  <option value="FRIENDS">Solo contactos aceptados</option>
                  <option value="NOBODY">No recibir mensajes nuevos</option>
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-md border bg-background px-3 text-sm font-semibold">
                <input type="checkbox" name="friendDiscoveryEnabled" defaultChecked={profile.friendDiscoveryEnabled} />
                Permitir que otros profesionales me agreguen como contacto
              </label>
              <div className="rounded-lg border bg-[#f4fbfa] p-4 md:col-span-2">
                <div className="flex items-start gap-3">
                  <UsersRound className="mt-1 h-5 w-5 text-primary" />
                  <p className="text-sm leading-6 text-[#415b65]">
                    Proxima capa social: solicitudes de contacto, grupos por proyecto, chats entre pares y recomendaciones verificadas por experiencia real.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-primary"><CreditCard className="h-5 w-5" /><span className="font-mono text-xs font-bold uppercase tracking-[0.16em]">Datos de cobro</span></div>
              <CardTitle>Cuenta bancaria y billeteras</CardTitle>
              <CardDescription>Información privada para pagos, adelantos, reembolsos o liquidaciones operativas con empresas autorizadas.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Input name="bankAccountHolder" defaultValue={profile.bankAccountHolder || ""} placeholder="Titular de la cuenta" />
              <Input name="bankName" defaultValue={profile.bankName || ""} placeholder="Banco" />
              <Input name="bankAccountNumber" defaultValue={profile.bankAccountNumber || ""} placeholder="Numero de cuenta" />
              <Input name="bankCci" defaultValue={profile.bankCci || ""} placeholder="CCI" />
              <Input name="yapePhone" defaultValue={profile.yapePhone || ""} placeholder="Yape" />
              <Input name="plinPhone" defaultValue={profile.plinPhone || ""} placeholder="Plin" />
              <Textarea name="paymentNotes" defaultValue={profile.paymentNotes || ""} placeholder="Notas de pago: moneda, restricciones, comprobantes o instrucciones." className="md:col-span-2" />
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-1 h-5 w-5 text-primary" />
              <p className="text-sm leading-6 text-muted-foreground">Guarda solo información vigente. Las empresas verán estos datos únicamente si existe una relación operativa autorizada.</p>
            </div>
            <Button type="submit" className="min-w-48">Guardar configuración</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
