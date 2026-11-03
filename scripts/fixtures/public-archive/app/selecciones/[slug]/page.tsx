import { notFound } from "next/navigation";
import { SharedSelectionView, selectionRecordIndex, type SharedSelection } from "@/components/terraqo/shared-selection-view";

const selection: SharedSelection = {
  title: "Selección de prueba", description: "Evidencias sintéticas para revisión de interfaz.",
  items: [
    { worklogId: "first", title: "Control de niveles", summary: "Participación documentada en campo.", occurredAt: "2026-10-28T02:00:00Z", locationLabel: "Lima", responsibilities: ["Control de cotas"], methods: ["Nivelación"], tools: ["Nivel óptico"], media: [1, 2].map(index => ({ id: `fixture-${index}`, href: `/fixture-${index}.svg` })) },
    { worklogId: "hidden-title", media: [] },
  ],
};
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ registro?: string | string[] }> }) {
  const { slug } = await params;
  const value = slug === "private" ? { ...selection, expiresAt: "2035-01-02T15:00:00Z", items: selection.items.map(item => ({ ...item, media: item.media.map(media => ({ ...media, downloadHref: `${media.href}?download=1` })) })) } : selection;
  const recordIndex = selectionRecordIndex((await searchParams).registro, value.items.length);
  if (recordIndex === -1) notFound();
  return <SharedSelectionView selection={value} basePath={`/selecciones/${slug}`} recordIndex={recordIndex} />;
}
