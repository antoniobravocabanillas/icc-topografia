import { SharedAccessRow } from "@/components/terraqo/shared-access-row";
export default function Fixture() {
  return <main className="mx-auto max-w-4xl p-6"><h1 className="text-2xl font-bold">Accesos que has compartido</h1>
    <p className="my-4 text-slate-600">Selección de prueba · Control geométrico</p>
    {[{ name: "active", lifecycle: "ACTIVE", expiresAt: "2030-01-01T00:01:00Z", revokedAt: null },
      { name: "expired", lifecycle: "ACTIVE", expiresAt: "2020-01-01T00:00:00Z", revokedAt: null },
      { name: "revoked", lifecycle: "ACTIVE", expiresAt: "2035-01-01T00:00:00Z", revokedAt: "2026-01-01T00:00:00Z" },
      { name: "invalid", lifecycle: "ACTIVE", expiresAt: "invalid", revokedAt: null }].map(row =>
      <section key={row.name} aria-label={row.name}><SharedAccessRow grant={{ ...row, inviteEmail: row.name + "@example.invalid", scopes: ["VIEW_COLLECTION", "DOWNLOAD_MEDIA"] }}>
        <button className="min-h-11 rounded-lg border px-4">Copiar enlace privado</button>
      </SharedAccessRow></section>)}
  </main>;
}
