import { ScopedSharingConsole } from "@/components/terraqo/scoped-sharing-console";
export default function Fixture() {
  return <main className="mx-auto max-w-5xl p-4"><ScopedSharingConsole candidates={[]} collections={[{
    id: "collection-fixture", title: "Selección de prueba", description: null, version: 3, items: [],
    grants: [{ id: "grant-fixture", inviteEmail: "reviewer@example.com", subjectUserId: null, scopes: ["VIEW_COLLECTION"], lifecycle: "ACTIVE", expiresAt: "2035-01-01T00:00:00Z", revokedAt: null }],
    publicProjection: { slug: "public-fixture", revokedAt: null },
  }]} /></main>;
}
