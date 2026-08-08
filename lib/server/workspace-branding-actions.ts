"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionTerraqoWorkspace } from "@/lib/terraqo/workspace-scope";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { defaultWorkspaceVisualIdentity, isHexColor } from "@/lib/terraqo/workspace-visual-identity";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeDomain(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim().toLowerCase();
}

function option(value: string, allowed: string[], fallback: string) {
  return allowed.includes(value) ? value : fallback;
}

function settingsObject(settings: Prisma.JsonValue | null | undefined) {
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? { ...(settings as Prisma.JsonObject) }
    : {};
}

export async function updateWorkspaceBrandingAction(formData: FormData) {
  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const sessionWorkspace = await getSessionTerraqoWorkspace();
  const workspace = await prisma.terraqoWorkspace.findUnique({
    where: { id: sessionWorkspace.id },
    select: { id: true, slug: true, name: true }
  });
  if (!workspace) return;
  const brandName = text(formData, "brandName") || workspace.name;
  const publicSlug = slugify(text(formData, "publicSlug") || brandName || workspace.slug);
  const domain = normalizeDomain(text(formData, "domain"));
  const logoUrl = text(formData, "logoUrl");
  const current = await prisma.terraqoWorkspace.findUnique({
    where: { id: workspace.id },
    select: { settings: true }
  });
  const settings = settingsObject(current?.settings);
  settings.visualIdentity = {
    primaryColor: isHexColor(text(formData, "primaryColor")) ? text(formData, "primaryColor") : defaultWorkspaceVisualIdentity.primaryColor,
    accentColor: isHexColor(text(formData, "accentColor")) ? text(formData, "accentColor") : defaultWorkspaceVisualIdentity.accentColor,
    backgroundColor: isHexColor(text(formData, "backgroundColor")) ? text(formData, "backgroundColor") : defaultWorkspaceVisualIdentity.backgroundColor,
    fontFamily: option(text(formData, "fontFamily"), ["system", "display", "serif"], defaultWorkspaceVisualIdentity.fontFamily),
    heroPattern: option(text(formData, "heroPattern"), ["soft-grid", "topographic", "clean", "dark-panel"], defaultWorkspaceVisualIdentity.heroPattern),
    badgeLabel: text(formData, "badgeLabel") || defaultWorkspaceVisualIdentity.badgeLabel,
    updatedAt: new Date().toISOString()
  };

  const existingSlug = await prisma.terraqoWorkspace.findFirst({
    where: { id: { not: workspace.id }, OR: [{ slug: publicSlug }, { publicSlug }] },
    select: { id: true }
  });

  if (existingSlug) redirect("/admin/workspace/marca?error=slug");

  await prisma.terraqoWorkspace.update({
    where: { id: workspace.id },
    data: {
      brandName,
      publicSlug,
      domain: domain || null,
      logoUrl: logoUrl || null,
      industry: text(formData, "industry") || null,
      description: text(formData, "description") || null,
      settings
    }
  });

  revalidatePath("/admin");
  revalidatePath("/admin/workspace/marca");
  revalidatePath(`/empresas/${publicSlug}`);
  redirect("/admin/workspace/marca?success=brand");
}

export async function updateCompanyLiveProfileAction(formData: FormData) {
  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const sessionWorkspace = await getSessionTerraqoWorkspace();
  const current = await prisma.terraqoWorkspace.findUnique({
    where: { id: sessionWorkspace.id },
    select: { settings: true, brandName: true, publicSlug: true, slug: true }
  });

  const settings = settingsObject(current?.settings);
  settings.companyLiveProfile = {
    headline: text(formData, "headline"),
    summary: text(formData, "summary"),
    services: text(formData, "services").split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 12),
    differentiators: text(formData, "differentiators").split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 12),
    coverage: text(formData, "coverage"),
    contactEmail: text(formData, "contactEmail"),
    contactPhone: text(formData, "contactPhone"),
    publicEnabled: formData.get("publicEnabled") === "on",
    updatedAt: new Date().toISOString()
  };

  await prisma.terraqoWorkspace.update({
    where: { id: sessionWorkspace.id },
    data: { settings }
  });

  const publicSlug = current?.publicSlug || current?.slug;
  revalidatePath("/admin/workspace/perfil");
  if (publicSlug) revalidatePath(`/empresas/${publicSlug}`);
  redirect("/admin/workspace/perfil?success=profile");
}
