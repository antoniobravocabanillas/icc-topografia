import type { TerraqoModuleCode } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { terraqoModules, workspace } from "@/lib/workspace";

async function toggleWorkspaceModule(formData: FormData) {
  "use server";

  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);

  const workspaceId = String(formData.get("workspaceId") || "");
  const code = String(formData.get("code") || "") as TerraqoModuleCode;
  const active = String(formData.get("active") || "") === "true";

  if (!workspaceId || !code) return;

  await prisma.terraqoWorkspaceModule.upsert({
    where: { workspaceId_code: { workspaceId, code } },
    update: {
      active,
      enabledAt: active ? new Date() : undefined,
      disabledAt: active ? null : new Date()
    },
    create: {
      workspaceId,
      code,
      active,
      enabledAt: active ? new Date() : undefined,
      disabledAt: active ? undefined : new Date()
    }
  });

  revalidatePath("/admin/terraqo");
}

export default async function TerraqoAdminPage() {
  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);

  const workspaces = await prisma.terraqoWorkspace.findMany({
    where: { deletedAt: null },
    include: {
      company: true,
      modules: true,
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          members: true,
          clients: true,
          leads: true,
          products: true,
          services: true,
          projects: true,
          tickets: true,
          jobPosts: true,
          forumChannels: true
        }
      }
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }]
  });

  const activeWorkspaces = workspaces.filter((item) => item.active).length;
  const activeModules = workspaces.reduce((total, item) => total + item.modules.filter((module) => module.active).length, 0);
  const premiumWorkspaces = workspaces.filter((item) => ["PREMIUM", "ENTERPRISE"].includes(item.subscriptions[0]?.tier || "")).length;

  return (
    <section className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-primary">Terraqo producto</p>
          <h1 className="font-display text-3xl font-bold">Workspaces y modulos activables</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Terraqo opera como plataforma multi-cliente. Cada empresa tiene su workspace, plan,
            modulos habilitados y permisos separados para CRM, proyectos, tienda, red profesional,
            CV vivo, marketplace laboral, foros, documentos y analitica.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/api/terraqo/workspaces/${workspace.defaultWorkspaceSlug}/modules`} target="_blank" rel="noreferrer">
            Ver API ICC
          </a>
        </Button>
        <Button asChild>
          <Link href="/admin/terraqo/red">Red profesional</Link>
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Clientes activos</CardDescription>
            <CardTitle className="text-3xl">{activeWorkspaces}</CardTitle>
            <p className="text-sm font-semibold">Workspaces Terraqo</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Servicios habilitados</CardDescription>
            <CardTitle className="text-3xl">{activeModules}</CardTitle>
            <p className="text-sm font-semibold">Modulos activos</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Planes con red profesional</CardDescription>
            <CardTitle className="text-3xl">{premiumWorkspaces}</CardTitle>
            <p className="text-sm font-semibold">Premium / Enterprise</p>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalogo de modulos Terraqo</CardTitle>
          <CardDescription>
            Esta es la base para vender Terraqo por capas: software, CRM, operaciones, red profesional,
            marketplace, comunidad y servicios avanzados.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {terraqoModules.map((module) => (
            <div key={module.code} className="rounded-md border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{module.label}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{module.description}</p>
                </div>
                <Badge variant="outline">{module.minimumTier}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-5">
        {workspaces.map((item) => {
          const subscription = item.subscriptions[0];
          const moduleState = new Map(item.modules.map((module) => [module.code, module.active]));

          return (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{item.name}</CardTitle>
                      <Badge variant={item.active ? "default" : "outline"}>{item.active ? "Activo" : "Inactivo"}</Badge>
                      <Badge variant="secondary">{subscription?.tier ?? "Sin plan"}</Badge>
                    </div>
                    <CardDescription className="mt-2">
                      {item.company?.tradeName ?? item.company?.legalName ?? "Sin empresa vinculada"} | {item.domain ?? item.slug}
                    </CardDescription>
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3 lg:text-right">
                    <span>{item._count.members} miembros</span>
                    <span>{item._count.leads} leads</span>
                    <span>{item._count.projects} proyectos</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  {[
                    ["Clientes", item._count.clients],
                    ["Servicios", item._count.services],
                    ["Productos", item._count.products],
                    ["Tickets", item._count.tickets],
                    ["Convocatorias", item._count.jobPosts],
                    ["Foros", item._count.forumChannels]
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-md border bg-muted/20 p-3">
                      <p className="text-2xl font-bold">{value}</p>
                      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {terraqoModules.map((module) => {
                    const active = moduleState.get(module.code) ?? false;

                    return (
                      <div key={module.code} className="flex items-center justify-between gap-3 rounded-md border p-3">
                        <div>
                          <p className="text-sm font-semibold">{module.label}</p>
                          <p className="text-xs text-muted-foreground">{module.code}</p>
                        </div>
                        <form action={toggleWorkspaceModule}>
                          <input type="hidden" name="workspaceId" value={item.id} />
                          <input type="hidden" name="code" value={module.code} />
                          <input type="hidden" name="active" value={String(!active)} />
                          <Button size="sm" variant={active ? "default" : "outline"}>
                            {active ? "Activo" : "Activar"}
                          </Button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
