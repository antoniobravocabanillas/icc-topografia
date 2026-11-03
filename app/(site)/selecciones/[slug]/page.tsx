import { SelectionAccessRequestForm } from "@/components/terraqo/selection-access-request-form";
import { selectionAccessRequestsEnabled } from "@/lib/terraqo/selection-access-request";
import { SelectionAccessBoundary } from "@/components/terraqo/selection-access-boundary";
import { selectionAccessSnapshot } from "@/lib/server/selection-access-snapshot";
import { notFound } from "next/navigation";
import { SharedSelectionView, selectionRecordIndex } from "@/components/terraqo/shared-selection-view";
import { getPublicCollectionProjection, ScopedSharingError } from "@/lib/terraqo/scoped-sharing";

export const dynamic = "force-dynamic";

export default async function PublicSelectionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ registro?: string | string[] }> }) {
  if (process.env.TERRAQO_SCOPED_SHARING_V1 !== "true") notFound();
  const { slug } = await params;
  const selection = await getPublicCollectionProjection(slug).catch((error) => {
    if (error instanceof ScopedSharingError && error.status === 404) {
      if (selectionAccessRequestsEnabled()) return null;
      notFound();
    }
    throw error;
  });

  if (!selection) return <section className="rounded-xl border border-[#294057] bg-[#07111e] p-6 text-white"><h1 className="text-xl font-semibold">Esta selección no está disponible.</h1><SelectionAccessRequestForm target={{ targetType: "public-link", target: slug }} returnPath={`/selecciones/${encodeURIComponent(slug)}`} /></section>;
  const recordIndex = selectionRecordIndex((await searchParams).registro, selection.items.length);
  if (recordIndex === -1) notFound();
  const basePath = `/selecciones/${encodeURIComponent(slug)}`;
  const { fingerprint } = selectionAccessSnapshot(selection);
  return <SelectionAccessBoundary key={fingerprint} requestTarget={selectionAccessRequestsEnabled() ? { targetType: "public-link", target: slug } : undefined} endpoint={`/api/v1/public/selections/${encodeURIComponent(slug)}`} fingerprint={fingerprint} returnPath={recordIndex === undefined ? basePath : `${basePath}?registro=${recordIndex + 1}`}><SharedSelectionView selection={selection} basePath={basePath} recordIndex={recordIndex} /></SelectionAccessBoundary>;
}
