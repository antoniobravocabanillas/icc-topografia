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
  description: "Privacidad, perfil publico, mensajes y datos de cobro del Portal Terraqo.",
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

export default async function PortalSettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    include: { user: { select: { name: true, email: true, image: true } } }
  });

  if (!profile) redirect("/portal?status=profile-required");

  const publicCvHref = profile.username ? `${terraqoDomains.public}/cv/${profile.username}` : null;

  return (
    <div className="min-w-0 py-8 lg:py-10">
      <div className="mx-auto max-w-6xl space-y-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-primary">Configuracion profesional</p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#071b28] lg:text-5xl">Tu perfil, tus permisos y tus datos privados.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#4a6570]">
              Controla como te encuentran, quien puede escribirte y que informacion operativa pueden ver las empresas con las que trabajas.
            </p>
          </div>
          <Card className="border-primary/20 bg-[#eaf8f6]">
            <CardContent className="p-5">
              <div className="flex gap-3">
                <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-6 text-[#254751]">
                  Los datos bancarios y de contacto se usan para operaciones vinculadas a tus proyectos. Terraqo no los muestra en tu CV publico.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {params.success === "settings" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Configuracion guardada correctamente.
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
                <div className="flex items-center gap-2 text-primary"><UserRound className="h-5 w-5" /><span className="font-mono text-xs font-bold uppercase tracking-[0.16em]">Perfil publico</span></div>
                <CardTitle className="mt-3">Usuario y CV vivo</CardTitle>
                <CardDescription>Define un enlace corto para compartir tu perfil profesional validado.</CardDescription>
              </div>
              {publicCvHref ? (
                <Button asChild variant="outline">
                  <Link href={publicCvHref} target="_blank">Ver CV publico</Link>
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
                  <span>Crea un usuario para activar tu enlace publico. Tu CV vivo solo muestra informacion profesional permitida.</span>
                )}
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
              <CardDescription>Informacion privada para pagos, adelantos, reembolsos o liquidaciones operativas con empresas autorizadas.</CardDescription>
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
              <p className="text-sm leading-6 text-muted-foreground">Guarda solo informacion vigente. Las empresas veran estos datos unicamente si existe una relacion operativa autorizada.</p>
            </div>
            <Button type="submit" className="min-w-48">Guardar configuracion</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
