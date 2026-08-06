import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Building2, ImagePlus, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import {
  ALLOWED_CLIENT_LOGO_TYPES,
  createClientLogoKey,
  getClientLogoStore,
  MAX_CLIENT_LOGO_SIZE
} from "@/lib/server/media";
import { createMetadata } from "@/lib/seo";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { absoluteUrl } from "@/lib/utils";

export const metadata = createMetadata({
  title: "Marca blanca del workspace",
  description: "Configura la marca, logo y datos visibles del workspace Terraqo.",
  path: "/portal/workspace"
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

const workspaceManagerRoles = new Set(["OWNER", "ADMIN", "MANAGER"]);
const platformManagerRoles = new Set(["SUPER_ADMIN", "ADMIN", "COMMERCIAL_ADMIN"]);

function textField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function canManageWorkspace(input: { memberRole?: string | null; platformRole?: string | null; ownerUserId?: string | null; userId?: string | null }) {
  return (
    (input.memberRole ? workspaceManagerRoles.has(input.memberRole) : false) ||
    (input.platformRole ? platformManagerRoles.has(input.platformRole) : false) ||
    Boolean(input.ownerUserId && input.userId && input.ownerUserId === input.userId)
  );
}

async function updateWorkspaceBrandAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/cuenta");

  const workspaceId = await getDefaultTerraqoWorkspaceId();
  const membership = await prisma.terraqoWorkspaceMember.findFirst({
    where: {
      workspaceId,
      active: true,
      user: { OR: [{ id: session.user.id }, { email: session.user.email }] }
    },
    select: {
      role: true,
      workspace: { select: { ownerUserId: true, logoUrl: true } }
    }
  });

  if (!canManageWorkspace({
    memberRole: membership?.role,
    platformRole: session.user.role,
    ownerUserId: membership?.workspace.ownerUserId,
    userId: session.user.id
  })) {
    redirect("/portal/workspace?status=permission");
  }

  const logoFile = formData.get("logoFile");
  let logoUrl = textField(formData, "logoUrl") || membership?.workspace.logoUrl || null;

  if (logoFile instanceof File && logoFile.size > 0) {
    if (!ALLOWED_CLIENT_LOGO_TYPES.has(logoFile.type)) redirect("/portal/workspace?status=logo-type");
    if (logoFile.size > MAX_CLIENT_LOGO_SIZE) redirect("/portal/workspace?status=logo-size");

    const key = createClientLogoKey(logoFile.name || "workspace-logo.png");
    await getClientLogoStore().set(key, await logoFile.arrayBuffer(), {
      metadata: {
        contentType: logoFile.type,
        originalName: logoFile.name,
        size: logoFile.size,
        uploadedAt: new Date().toISOString(),
        workspaceId,
        uploadedBy: session.user.id
      }
    });
    logoUrl = absoluteUrl(`/api/media/${key}`);
  }

  const brandName = textField(formData, "brandName");
  const name = textField(formData, "name");
  const domain = textField(formData, "domain");
  const industry = textField(formData, "industry");
  const description = textField(formData, "description");

  await prisma.terraqoWorkspace.update({
    where: { id: workspaceId },
    data: {
      brandName: brandName || null,
      name: name || brandName || undefined,
      domain: domain || null,
      industry: industry || null,
      description: description || null,
      logoUrl
    }
  });

  revalidatePath("/portal");
  revalidatePath("/portal/workspace");
  revalidatePath("/cuenta");
  redirect("/portal/workspace?success=brand");
}

type WorkspacePageProps = {
  searchParams: Promise<{ success?: string; status?: string }>;
};

export default async function WorkspaceBrandPage({ searchParams }: WorkspacePageProps) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/cuenta");

  const workspaceId = await getDefaultTerraqoWorkspaceId();
  const membership = await prisma.terraqoWorkspaceMember.findFirst({
    where: {
      workspaceId,
      active: true,
      user: { OR: [{ id: session.user.id }, { email: session.user.email }] }
    },
    select: {
      role: true,
      workspace: {
        select: {
          name: true,
          brandName: true,
          slug: true,
          domain: true,
          industry: true,
          description: true,
          logoUrl: true,
          ownerUserId: true
        }
      }
    }
  });

  if (!membership?.workspace) redirect("/portal");

  const workspace = membership.workspace;
  const allowed = canManageWorkspace({
    memberRole: membership.role,
    platformRole: session.user.role,
    ownerUserId: workspace.ownerUserId,
    userId: session.user.id
  });

  const statusMessage =
    params.status === "permission"
      ? "Este usuario puede operar como cliente, pero no tiene permisos para modificar la identidad del workspace."
      : params.status === "logo-type"
        ? "Formato no permitido. Usa SVG, JPG, PNG, WebP o AVIF."
        : params.status === "logo-size"
          ? "El logo supera el limite de 3 MB."
          : null;

  return (
    <div className="space-y-7 py-6 lg:py-8">
      {params.success === "brand" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Marca blanca actualizada. El logo y nombre se veran en el Portal Terraqo y en accesos con workspace.
        </div>
      ) : null}
      {statusMessage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Marca blanca del workspace</CardTitle>
            <CardDescription>
              Configura la identidad que veran los usuarios asignados al workspace. Esto no crea un portal paralelo: alimenta el Portal Terraqo real.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateWorkspaceBrandAction} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  Marca visible
                  <Input name="brandName" defaultValue={workspace.brandName || ""} placeholder="ICC Topografia" disabled={!allowed} />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Nombre legal / interno
                  <Input name="name" defaultValue={workspace.name} placeholder="ICC Topografia Group SAC" disabled={!allowed} />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Dominio principal
                  <Input name="domain" defaultValue={workspace.domain || ""} placeholder="icctopografia.com" disabled={!allowed} />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Rubro
                  <Input name="industry" defaultValue={workspace.industry || ""} placeholder="Topografia, LiDAR, obras" disabled={!allowed} />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold">
                Descripcion comercial
                <Textarea name="description" defaultValue={workspace.description || ""} placeholder="Resumen visible para propuestas, soporte y portal." disabled={!allowed} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Logo del workspace
                <Input name="logoFile" type="file" accept="image/svg+xml,image/jpeg,image/png,image/webp,image/avif" disabled={!allowed} />
                <span className="text-xs font-normal text-muted-foreground">SVG, JPG, PNG, WebP o AVIF. Maximo 3 MB.</span>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                URL de logo existente
                <Input name="logoUrl" defaultValue={workspace.logoUrl || ""} placeholder="https://..." disabled={!allowed} />
              </label>

              {allowed ? (
                <SubmitButton pendingText="Guardando marca...">Guardar marca blanca</SubmitButton>
              ) : (
                <Button type="button" disabled>No tienes permisos para editar este workspace</Button>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vista de marca</CardTitle>
            <CardDescription>Asi se resuelve la identidad del workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border bg-[#f7faf9] p-5">
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-[#063b3f] font-mono text-lg font-bold text-[#65e3d8]">
                  {workspace.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={workspace.logoUrl} alt={workspace.brandName || workspace.name} className="h-full w-full object-contain p-2" />
                  ) : (
                    <ImagePlus className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <p className="font-display text-xl font-bold">{workspace.brandName || workspace.name}</p>
                  <p className="text-sm text-muted-foreground">/{workspace.slug}</p>
                </div>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">{workspace.description || "Sin descripcion comercial configurada."}</p>
            </div>

            <div className="rounded-xl border bg-white p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Aislamiento correcto</p>
              <p className="mt-2 text-muted-foreground">
                Los compradores/clientes pueden ver pedidos, soporte y documentos. La identidad del workspace solo la modifica quien administra la empresa.
              </p>
            </div>

            <div className="rounded-xl border bg-white p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-primary" /> Marca blanca</p>
              <p className="mt-2 text-muted-foreground">
                El login con <code className="rounded bg-muted px-1 py-0.5">?workspace={workspace.slug}</code> y el header del portal usan esta configuracion.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
