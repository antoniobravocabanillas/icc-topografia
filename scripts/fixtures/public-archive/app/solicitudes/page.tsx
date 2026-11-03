import { SelectionAccessRequestForm } from "@/components/terraqo/selection-access-request-form";
import { SelectionAccessInbox } from "@/components/terraqo/selection-access-inbox";
export default async function Page({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const changed = (await searchParams).changed === "1";
  return <main className="mx-auto max-w-4xl space-y-8 p-4">
    <SelectionAccessRequestForm target={{ targetType: "collection", target: "collection-123" }} returnPath="/selecciones/fixture" />
    <SelectionAccessInbox requests={[{ id: "cm000000000000000000000001", version: 1, collectionVersion: 1, message: "Solicitud de prueba", requester: { name: "Persona de prueba" }, collection: { version: changed ? 2 : 1, title: "Selección de prueba", items: [{ allowedFields: ["title", "summary"], includeMedia: true, mediaIds: ["image-1"] }] } }]} />
  </main>;
}
