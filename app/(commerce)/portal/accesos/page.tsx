import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { listOwnedAccessCollections, ScopedSharingError } from "@/lib/terraqo/scoped-sharing";
import { AccessInventory } from "@/components/terraqo/access-inventory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accesos y permisos | Terraqo", robots: { index: false, follow: false } };
export default async function AccessPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta?callbackUrl=%2Fportal%2Faccesos");
  if (process.env.TERRAQO_SCOPED_SHARING_V1 !== "true") notFound();
  const rows = await listOwnedAccessCollections(session.user.id).catch(error => {
    if (error instanceof ScopedSharingError && error.status === 409) redirect("/portal?status=profile-required");
    throw error;
  });
  return <AccessInventory key={rows.map(row => `${row.id}:${row.version}`).join("|")} collections={rows.map(row => ({
    ...row, grants: row.grants.map(grant => ({ id: grant.id, inviteEmail: grant.inviteEmail, recipientLabel: grant.subjectUser?.name, scopes: grant.scopes,
      lifecycle: grant.lifecycle, expiresAt: grant.expiresAt.toISOString(), revokedAt: grant.revokedAt?.toISOString() ?? null })),
    publicProjection: row.publicProjection ? { ...row.publicProjection, revokedAt: row.publicProjection.revokedAt?.toISOString() ?? null } : null,
  }))} />;
}
