import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { WorkspacePortalToken } from "./workspace-portal-session";

// The professional profile belongs to the person, across their workspaces.
// Never select banking, identity documents, verification or subscription fields.
const select = { id: true, username: true, headline: true, bio: true, status: true,
  professionalCategories: true, specialties: true, equipment: true, software: true,
  messagePrivacy: true, updatedAt: true } as const;
const list = (limit: number) => z.string().max(4000).transform(value => value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean))
  .pipe(z.array(z.string().max(160)).max(limit)).transform(items => [...new Set(items)]);
const schema = z.object({ headline: z.string().trim().max(140), bio: z.string().trim().max(900),
  status: z.enum(["AVAILABLE", "WORKING", "OPEN_TO_PROJECTS", "NOT_AVAILABLE"]),
  professionalCategories: list(10), specialties: list(16), equipment: list(16), software: list(16),
  messagePrivacy: z.enum(["EVERYONE", "WORKSPACE", "FRIENDS", "NOBODY"]) }).strict();
type Profile = NonNullable<Awaited<ReturnType<typeof readProfile>>>;
const readProfile = (userId: string) => prisma.terraqoProfessionalProfile.findUnique({ where: { userId }, select });
function record(profile: Profile) {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(profile)) if (!["id", "updatedAt"].includes(key))
    fields[key] = Array.isArray(value) ? value.join("\n") : String(value ?? "");
  return { id: profile.id, title: profile.headline || "Mi perfil profesional", subtitle: profile.bio || "",
    status: profile.status, updatedAt: profile.updatedAt.toISOString(), fields, editable: true, canDelete: false };
}
export async function listProfessionalProfile(token: WorkspacePortalToken) {
  const profile = await readProfile(token.sub);
  return { schemaVersion: 1, workspaceSlug: token.workspaceSlug, resource: "profile",
    records: profile ? [record(profile)] : [], nextCursor: null, canCreate: false };
}
export async function updateProfessionalProfile(token: WorkspacePortalToken, input: unknown, id?: string, version?: string) {
  if (!id || !version || !z.string().datetime().safeParse(version).success) return { failure: "version" as const };
  const data = schema.parse(input);
  return prisma.$transaction(async tx => {
    // Both ownership and version are part of the write predicate. A profile ID
    // supplied by another user can never authorize a cross-account change.
    const current = await tx.terraqoProfessionalProfile.findFirst({ where: { id, userId: token.sub }, select: { id: true } });
    if (!current) return { failure: "missing" as const };
    const changed = await tx.terraqoProfessionalProfile.updateMany({ where: { id, userId: token.sub, updatedAt: new Date(version) },
      data: { ...data, headline: data.headline || null, bio: data.bio || null } });
    if (changed.count !== 1) return { failure: "version" as const };
    const saved = await tx.terraqoProfessionalProfile.findFirstOrThrow({ where: { id, userId: token.sub }, select });
    return { record: record(saved) };
  });
}
