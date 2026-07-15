import Link from "next/link";
import { Building2, CheckCircle2, Crown, Network, UserRound } from "lucide-react";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";

const demos = [
  { email: "demo.superadmin@terraqo.com", label: "Administracion Terraqo", description: "Workspaces, productos activables, suscripciones y gobierno global.", href: "/admin/terraqo", icon: Crown },
  { email: "demo.empresa@icctopografia.com", label: "Empresa / workspace", description: "Proyectos, talento, contenido y conversaciones privadas de ICC Topografia.", href: "/admin", icon: Building2 },
  { email: "demo.profesional@terraqo.com", label: "Profesional", description: "Bitacora, CV Vivo, oportunidades, Commons y mensajeria.", href: "/portal", icon: UserRound },
  { email: "demo.colega@terraqo.com", label: "Profesional colega", description: "Segundo perfil para probar colaboracion y chat entre pares.", href: "/portal/mensajes", icon: Network }
];

export const dynamic = "force-dynamic";

export default async function TerraqoJourneysPage() {
  await requireAdminPage(["SUPER_ADMIN"]);
  const users = await prisma.user.findMany({
    where: { email: { in: demos.map((demo) => demo.email) } },
    select: { email: true, role: true, terraqoProfessionalProfile: { select: { status: true, liveCvEnabled: true } }, terraqoMemberships: { where: { active: true }, select: { role: true, workspace: { select: { name: true } } } } }
  });
  const byEmail = new Map(users.map((user) => [user.email, user]));

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Centro de recorridos</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Observa Terraqo desde cada frente</h1>
        <p className="mt-3 text-muted-foreground">Cada acceso usa una identidad independiente. Abre una ventana privada diferente para comparar permisos sin mezclar sesiones.</p>
      </header>

      <section className="grid gap-4 xl:grid-cols-2">
        {demos.map((demo, index) => {
          const user = byEmail.get(demo.email);
          const Icon = demo.icon;
          return (
            <article key={demo.email} className="rounded-lg border bg-white p-6 shadow-technical">
              <div className="flex items-start justify-between gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="h-6 w-6" /></div>
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${user ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><CheckCircle2 className="h-3.5 w-3.5" />{user ? "Listo" : "Pendiente"}</span>
              </div>
              <p className="mt-6 font-mono text-xs text-primary">0{index + 1} · {user?.role || "SIN CREAR"}</p>
              <h2 className="mt-2 font-display text-2xl font-bold">{demo.label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{demo.description}</p>
              <div className="mt-5 rounded-md bg-muted/50 p-3 text-sm"><p className="font-semibold">{demo.email}</p><p className="mt-1 text-xs text-muted-foreground">{user?.terraqoMemberships[0]?.workspace.name || "Acceso global"} · {user?.terraqoMemberships[0]?.role || "sin membresia"}</p></div>
              <Button asChild className="mt-5"><Link href={demo.href}>Abrir este frente</Link></Button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
