import type { TerraqoModuleCode } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/server/api";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getTerraqoIndustryLabel, terraqoIndustries } from "@/lib/terraqo/industries";
import { createTerraqoWorkspace } from "@/lib/terraqo/workspace-repository";
import { setWorkspaceModuleState, type WorkspaceProvisioningMode } from "@/lib/terraqo/workspace-modules";
import { getDefaultModulesForTier, terraqoModules } from "@/lib/workspace";

function textField(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

async function createWorkspaceAction(formData: FormData) {
  "use server";
  await requireAdminPage(["SUPER_ADMIN"]);
  const name = textField(formData, "name");
  const slug = slugify(textField(formData, "slug") || name);
  const plan = textField(formData, "plan") as "FREE" | "BASIC" | "PROFESSIONAL" | "PREMIUM" | "ENTERPRISE";
  const companyId = textField(formData, "companyId");
  const newCompanyName = textField(formData, "newCompanyName");
  const industry = textField(formData, "industry");
  if (!name || !slug || !["FREE", "BASIC", "PROFESSIONAL", "PREMIUM", "ENTERPRISE"].includes(plan)) return;
  const workspace = await createTerraqoWorkspace({
    name,
    slug,
    companyId: companyId || undefined,
    industry: industry || undefined,
    domain: textField(formData, "domain") || undefined,
    brandName: textField(formData, "brandName") || name,
    description: textField(formData, "description") || undefined,
    plan
  });
  if (!companyId && newCompanyName) {
    const company = await prisma.company.create({
      data: {
        legalName: newCompanyName,
        tradeName: textField(formData, "newCompanyTradeName") || newCompanyName,
        document: textField(formData, "newCompanyDocument") || null,
        website: textField(formData, "newCompanyWebsite") || textField(formData, "domain") || null,
        logoUrl: textField(formData, "newCompanyLogoUrl") || null,
        industry: industry || null,
        status: "cliente",
        terraqoWorkspaceId: workspace.id
      }
    });
    await prisma.terraqoWorkspace.update({
      where: { id: workspace.id },
      data: { companyId: company.id }
    });
  }
  revalidatePath("/admin/terraqo");
}

async function updateWorkspaceAction(formData: FormData) {
  "use server";
  await requireAdminPage(["SUPER_ADMIN"]);
  const workspaceId = textField(formData, "workspaceId");
  const tier = textField(formData, "tier") as "FREE" | "BASIC" | "PROFESSIONAL" | "PREMIUM" | "ENTERPRISE";
  const status = textField(formData, "subscriptionStatus") as "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
  const seats = Math.max(1, Number(textField(formData, "seats") || 1));
  const selectedCompanyId = textField(formData, "companyId");
  const newCompanyName = textField(formData, "newCompanyName");
  const industry = textField(formData, "industry");
  if (!workspaceId) return;
  const latestSubscription = await prisma.terraqoSubscription.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    let companyId = selectedCompanyId === "__none" ? null : selectedCompanyId || null;
    if (newCompanyName) {
      const company = await tx.company.create({
        data: {
          legalName: newCompanyName,
          tradeName: textField(formData, "newCompanyTradeName") || newCompanyName,
          document: textField(formData, "newCompanyDocument") || null,
          website: textField(formData, "newCompanyWebsite") || null,
          logoUrl: textField(formData, "newCompanyLogoUrl") || null,
          industry: industry || null,
          status: "cliente",
          terraqoWorkspaceId: workspaceId
        },
        select: { id: true }
      });
      companyId = company.id;
    }
    await tx.terraqoWorkspace.update({
      where: { id: workspaceId },
      data: {
        name: textField(formData, "name"),
        brandName: textField(formData, "brandName") || null,
        domain: textField(formData, "domain") || null,
        industry: industry || null,
        companyId,
        active: textField(formData, "active") === "true"
      }
    });
    if (latestSubscription) {
      await tx.terraqoSubscription.update({ where: { id: latestSubscription.id }, data: { tier, status, seats } });
    } else {
      await tx.terraqoSubscription.create({ data: { workspaceId, tier, status, seats } });
    }
    const entitledModules = new Set(getDefaultModulesForTier(tier));
    const currentModules = await tx.terraqoWorkspaceModule.findMany({ where: { workspaceId }, select: { code: true, active: true } });
    for (const code of entitledModules) {
      await tx.terraqoWorkspaceModule.upsert({
        where: { workspaceId_code: { workspaceId, code } },
        update: { active: true, enabledAt: new Date(), disabledAt: null },
        create: { workspaceId, code, active: true, enabledAt: new Date(), config: { provisioning: { mode: "blank", version: 1, provisionedAt: new Date().toISOString() } } }
      });
    }
    for (const workspaceModule of currentModules) {
      if (!entitledModules.has(workspaceModule.code) && workspaceModule.active) {
        await tx.terraqoWorkspaceModule.update({ where: { workspaceId_code: { workspaceId, code: workspaceModule.code } }, data: { active: false, disabledAt: new Date() } });
      }
    }
  });
  revalidatePath("/admin/terraqo");
}

async function toggleWorkspaceModule(formData: FormData) {
  "use server";

  await requireAdminPage(["SUPER_ADMIN"]);

  const workspaceId = String(formData.get("workspaceId") || "");
  const code = String(formData.get("code") || "") as TerraqoModuleCode;
  const active = String(formData.get("active") || "") === "true";
  const requestedMode = String(formData.get("provisioningMode") || "blank");
  const mode: WorkspaceProvisioningMode = requestedMode === "template" ? "template" : "blank";

  if (!workspaceId || !code) return;

  await setWorkspaceModuleState({ workspaceId, code, active, mode });

  revalidatePath("/admin/terraqo");
}

export default async function TerraqoAdminPage() {
  await requireAdminPage(["SUPER_ADMIN"]);

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

  const registeredCompanies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      document: true,
      industry: true,
      website: true,
      logoUrl: true
    },
    orderBy: [{ legalName: "asc" }]
  });

  const activeWorkspaces = workspaces.filter((item) => item.active).length;
  const activeModules = workspaces.reduce((total, item) => total + item.modules.filter((module) => module.active).length, 0);
  const premiumWorkspaces = workspaces.filter((item) => ["PREMIUM", "ENTERPRISE"].includes(item.subscriptions[0]?.tier || "")).length;
  const [pendingDocuments, pendingIdentities, pendingExperiences, totalProfessionals] = await Promise.all([
    prisma.terraqoProfessionalDocument.count({ where: { reviewStatus: "SUBMITTED" } }),
    prisma.terraqoProfessionalProfile.count({ where: { identityVerificationStatus: "UNDER_REVIEW" } }),
    prisma.terraqoProfessionalExperience.count({ where: { verificationStatus: "REQUESTED" } }),
    prisma.terraqoProfessionalProfile.count()
  ]);

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
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/terraqo/usuarios">Usuarios y accesos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/terraqo/red">Red profesional</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/terraqo/validaciones">Validaciones Terraqo</Link>
          </Button>
        </div>
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

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Gobierno global</p>
              <CardTitle className="mt-2">Mesa de validaciones Terraqo</CardTitle>
              <CardDescription className="mt-2 max-w-3xl">
                Control central para documentos de identidad, experiencias verificables y cuentas profesionales
                de todos los workspaces. Esto pertenece a Terraqo, no al panel operativo de cada cliente.
              </CardDescription>
            </div>
            <Button asChild>
              <Link href="/admin/terraqo/validaciones">Abrir mesa de validaciones</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {[
            ["Documentos por revisar", pendingDocuments],
            ["Identidades en revisión", pendingIdentities],
            ["Experiencias solicitadas", pendingExperiences],
            ["Profesionales registrados", totalProfessionals]
          ].map(([label, count]) => (
            <div key={String(label)} className="rounded-xl border bg-background/80 p-4 shadow-sm">
              <p className="text-3xl font-bold">{count}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">{label}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo cliente Terraqo</CardTitle>
          <CardDescription>Crea un workspace aislado. Sus datos comienzan en blanco y solo recibe los modulos incluidos en el plan seleccionado.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createWorkspaceAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input name="name" placeholder="Empresa o workspace" required />
            <Input name="slug" placeholder="slug-del-workspace" />
            <Input name="brandName" placeholder="Marca visible" />
            <Input name="domain" placeholder="empresa.com" />
            <select name="industry" defaultValue="" className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="">Seleccionar industria</option>
              {terraqoIndustries.map((industry) => <option key={industry.value} value={industry.value}>{industry.label}</option>)}
            </select>
            <select name="companyId" defaultValue="" className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="">Sin empresa registrada</option>
              {registeredCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.tradeName || company.legalName}{company.document ? ` - ${company.document}` : ""}
                </option>
              ))}
            </select>
            <select name="plan" defaultValue="BASIC" className="h-10 rounded-md border bg-background px-3 text-sm">
              {['FREE', 'BASIC', 'PROFESSIONAL', 'PREMIUM', 'ENTERPRISE'].map((tier) => <option key={tier}>{tier}</option>)}
            </select>
            <Input name="description" placeholder="Descripcion interna" />
            <div className="rounded-md border bg-background/70 p-3 md:col-span-2 xl:col-span-4">
              <p className="text-sm font-semibold">Crear empresa registrada si no existe</p>
              <p className="mt-1 text-xs text-muted-foreground">Opcional. Si completas el nombre, quedara vinculada automaticamente a este workspace.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Input name="newCompanyName" placeholder="Razon social" />
                <Input name="newCompanyTradeName" placeholder="Nombre comercial" />
                <Input name="newCompanyDocument" placeholder="RUC / documento" />
                <Input name="newCompanyWebsite" placeholder="Web de la empresa" />
                <Input name="newCompanyLogoUrl" placeholder="URL del logo" />
              </div>
            </div>
            <Button type="submit" className="md:col-span-2 xl:col-span-4">Crear workspace aislado</Button>
          </form>
        </CardContent>
      </Card>

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
          const moduleState = new Map(item.modules.map((module) => [module.code, module]));

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
                      {item.company?.tradeName ?? item.company?.legalName ?? "Sin empresa vinculada"} | {item.domain ?? item.slug} | {getTerraqoIndustryLabel(item.industry)}
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
                <form action={updateWorkspaceAction} className="mb-6 grid gap-3 rounded-md border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-4">
                  <input type="hidden" name="workspaceId" value={item.id} />
                  <Input name="name" defaultValue={item.name} aria-label="Nombre del workspace" required />
                  <Input name="brandName" defaultValue={item.brandName || ""} placeholder="Marca" />
                  <Input name="domain" defaultValue={item.domain || ""} placeholder="Dominio" />
                  <select name="industry" defaultValue={item.industry || ""} className="h-10 rounded-md border bg-background px-3 text-sm">
                    <option value="">Seleccionar industria</option>
                    {terraqoIndustries.map((industry) => <option key={industry.value} value={industry.value}>{industry.label}</option>)}
                  </select>
                  <select name="tier" defaultValue={subscription?.tier || "BASIC"} className="h-10 rounded-md border bg-background px-3 text-sm">
                    {['FREE', 'BASIC', 'PROFESSIONAL', 'PREMIUM', 'ENTERPRISE'].map((tier) => <option key={tier}>{tier}</option>)}
                  </select>
                  <select name="subscriptionStatus" defaultValue={subscription?.status || "TRIALING"} className="h-10 rounded-md border bg-background px-3 text-sm">
                    {['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'].map((status) => <option key={status}>{status}</option>)}
                  </select>
                  <Input name="seats" type="number" min={1} defaultValue={subscription?.seats || 1} aria-label="Cantidad de usuarios" />
                  <select name="active" defaultValue={String(item.active)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="true">Workspace activo</option><option value="false">Workspace suspendido</option></select>
                  <select name="companyId" defaultValue={item.companyId || "__none"} className="h-10 rounded-md border bg-background px-3 text-sm md:col-span-2">
                    <option value="__none">Sin empresa vinculada</option>
                    {registeredCompanies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.tradeName || company.legalName}{company.document ? ` - ${company.document}` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="rounded-md border bg-background/70 p-3 md:col-span-2 xl:col-span-4">
                    <p className="text-sm font-semibold">Crear y vincular empresa registrada</p>
                    <p className="mt-1 text-xs text-muted-foreground">Usalo cuando el cliente aun no existe en Terraqo. Si completas el nombre, reemplaza la vinculacion seleccionada.</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <Input name="newCompanyName" placeholder="Razon social" />
                      <Input name="newCompanyTradeName" placeholder="Nombre comercial" />
                      <Input name="newCompanyDocument" placeholder="RUC / documento" />
                      <Input name="newCompanyWebsite" placeholder="Web de la empresa" />
                      <Input name="newCompanyLogoUrl" placeholder="URL del logo" />
                    </div>
                  </div>
                  <Button type="submit" variant="outline" className="md:col-span-2 xl:col-span-4">Guardar configuracion del cliente</Button>
                </form>
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
                    const moduleRecord = moduleState.get(module.code);
                    const active = moduleRecord?.active ?? false;

                    return (
                      <div key={module.code} className="flex items-center justify-between gap-3 rounded-md border p-3">
                        <div>
                          <p className="text-sm font-semibold">{module.label}</p>
                          <p className="text-xs text-muted-foreground">{module.code}</p>
                        </div>
                        <form action={toggleWorkspaceModule} className="flex items-center gap-2">
                          <input type="hidden" name="workspaceId" value={item.id} />
                          <input type="hidden" name="code" value={module.code} />
                          <input type="hidden" name="active" value={String(!active)} />
                          {!active ? (
                            <select name="provisioningMode" defaultValue="blank" className="h-9 rounded-md border bg-background px-2 text-xs">
                              <option value="blank">En blanco</option>
                              <option value="template">Con plantilla</option>
                            </select>
                          ) : (
                            <input type="hidden" name="provisioningMode" value="blank" />
                          )}
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
