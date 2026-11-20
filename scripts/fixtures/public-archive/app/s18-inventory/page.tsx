import { AccessInventory } from "@/components/terraqo/access-inventory";
export default async function Fixture({ searchParams }: { searchParams: Promise<{ empty?: string }> }) {
  const query = await searchParams;
  return <main className="mx-auto max-w-7xl p-3"><AccessInventory collections={query.empty ? [] : [{
    id: "selection-fixture", title: "Control geométrico · Viaducto sur", version: 3,
    grants: [{ id: "grant-fixture", inviteEmail: "supervision@example.invalid", scopes: ["VIEW_COLLECTION"], lifecycle: "ACTIVE", expiresAt: "2035-01-01T00:00:00Z", revokedAt: null },
      { id: "expired-fixture", inviteEmail: "consultoria@example.invalid", scopes: ["VIEW_COLLECTION", "DOWNLOAD_MEDIA"], lifecycle: "ACTIVE", expiresAt: "2020-01-01T00:00:00Z", revokedAt: null }],
    publicProjection: { slug: "public-fixture", revokedAt: null },
  }, { id: "private-fixture", title: "Registro privado · Nivelación de losa", version: 1, grants: [], publicProjection: null }]} /></main>;
}
