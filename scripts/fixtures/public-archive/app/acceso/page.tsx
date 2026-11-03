import { SelectionAccessBoundary } from "@/components/terraqo/selection-access-boundary";

export default async function Page({ searchParams }: { searchParams: Promise<{ expiry?: string }> }) {
  const { expiry } = await searchParams;
  return <SelectionAccessBoundary endpoint="/api/fixture-access" fingerprint="authorized-v1" returnPath="/selecciones/private?registro=2" expiresAt={expiry ? "2030-01-01T12:00:01Z" : undefined}>
    <section><h1>Contenido autorizado de prueba</h1><label>Nota local<input /></label></section>
  </SelectionAccessBoundary>;
}
