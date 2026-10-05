import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { toWorkspacePortalRole } from "./workspace-portal-policy";
import { createRevocablePortalToken, type WorkspacePortalToken } from "./workspace-portal-session";

export async function listPortalWorkspaces(token: WorkspacePortalToken, cursor?: string) {
  const rows = await prisma.terraqoWorkspaceMember.findMany({
    where: { userId: token.sub, active: true, workspace: { active: true, deletedAt: null },
      ...(cursor ? { id: { gt: cursor } } : {}) },
    orderBy: { id: "asc" }, take: 31,
    select: { id: true, role: true, workspace: { select: { slug: true, name: true, brandName: true } } },
  });
  return {
    workspaces: rows.slice(0, 30).flatMap(row => {
      const role = toWorkspacePortalRole(row.role);
      return role ? [{ slug: row.workspace.slug, name: row.workspace.brandName || row.workspace.name,
        role, current: row.workspace.slug === token.workspaceSlug }] : [];
    }),
    nextCursor: rows.length > 30 ? rows[29].id : null,
  };
}

export class WorkspaceSwitchError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function switchPortalWorkspace(token: WorkspacePortalToken, slug: string) {
  if (!token.jti) throw new WorkspaceSwitchError(401, "Vuelve a iniciar sesión para cambiar de empresa.");
  const identifier = `portal-switch-attempt:${token.sub}`;
  const lock = BigInt.asIntN(64, BigInt(`0x${createHash("sha256").update(identifier).digest("hex").slice(0, 16)}`));
  return prisma.$transaction(async tx => {
    // One account-wide budget across instances, including invalid destinations.
    // The old grant remains valid until the device persists the new credentials.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${lock}::bigint)`;
    const now = new Date();
    await tx.verificationToken.deleteMany({ where: { identifier, expires: { lte: now } } });
    if (await tx.verificationToken.count({ where: { identifier, expires: { gt: now } } }) >= 30)
      return { error: 429 as const };
    await tx.verificationToken.create({ data: { identifier,
      token: createHash("sha256").update(randomUUID()).digest("hex"), expires: new Date(now.getTime() + 600_000) } });
    const current = await tx.verificationToken.findFirst({ where: {
      identifier: `portal-session:${token.workspaceId}:${token.sub}`,
      token: createHash("sha256").update(token.jti!).digest("hex"), expires: { gt: now },
    }, select: { token: true } });
    if (!current) return { error: 401 as const };
    const source = await tx.terraqoWorkspaceMember.findFirst({ where: { userId: token.sub,
      workspaceId: token.workspaceId, active: true, workspace: { active: true, deletedAt: null } }, select: { role: true } });
    if (!source || toWorkspacePortalRole(source.role) !== token.role) return { error: 401 as const };
    const membership = await tx.terraqoWorkspaceMember.findFirst({ where: {
      userId: token.sub, active: true, workspace: { slug, active: true, deletedAt: null },
    }, select: { role: true, workspaceId: true } });
    const role = membership && toWorkspacePortalRole(membership.role);
    if (!membership || !role) return { error: 403 as const };
    const session = await createRevocablePortalToken({ sub: token.sub, workspaceId: membership.workspaceId,
      workspaceSlug: slug, role }, tx);
    return { ...session, workspaceSlug: slug };
  }).then(result => {
    if ("error" in result) throw new WorkspaceSwitchError(result.error!, result.error === 429
      ? "Espera diez minutos antes de volver a cambiar de empresa." : "No se pudo autorizar el cambio de empresa.");
    return result;
  });
}
