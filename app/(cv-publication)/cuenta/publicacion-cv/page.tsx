import type { Metadata } from "next";
import React from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { CvPublicationScreen } from "@/components/portal/cv-publication-screen";
import { parseCvEntryQuery, webCvEntryEnabled, type CvEntryQuery } from "@/lib/terraqo/cv-publication-entry";
import { terraqoDomains } from "@/lib/terraqo-domains";
import { webCvPublicationIdentity } from "@/lib/server/web-cv-publication-identity";
import { CvPublicationError, readCvPublication } from "@/lib/server/portal-cv-publication";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Publicación del CV | Terraqo", robots: { index: false, follow: false } };

/** Deliberately outside commerce/PortalShell: entry and exit must create native
 * document navigation so a pending operation can trigger beforeunload. */
export default async function CvPublicationPage({ searchParams }: { searchParams: Promise<CvEntryQuery> }) {
  if (!webCvEntryEnabled(process.env.TERRAQO_WEB_CV_PUBLICATION_ENABLED)) notFound();
  const context = parseCvEntryQuery(await searchParams);
  if (!context) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect(`/cuenta?workspace=${encodeURIComponent(context.workspaceSlug)}`);
  const ownerId = session.user.id;
  const incoming = await headers();
  const request = new Request(`${terraqoDomains.portal}/api/terraqo/cv-publication`, { headers: {
    cookie: incoming.get("cookie") || "", "x-terraqo-cv-owner": ownerId,
  } });
  try {
    const identity = await webCvPublicationIdentity(request, context.workspaceSlug);
    // Bootstrap uses the same live locks/grant as the API. No profile or grant
    // is serialized here; the client rechecks session and fetches its own DTO.
    await readCvPublication(identity);
  } catch (error) {
    if (error instanceof CvPublicationError && (error.status === 403 || error.status === 404)) notFound();
    // A legacy/revoked grant reaches the screen's explicit re-login flow. Its
    // initial GET remains unauthorized; no replacement grant is minted here.
    if (!(error instanceof CvPublicationError && error.status === 401)) throw error;
  }
  return <main className="min-h-dvh bg-background px-4 py-6 sm:px-8 sm:py-10">
    <div className="mx-auto max-w-5xl"><CvPublicationScreen ownerId={ownerId} workspaceSlug={context.workspaceSlug} /></div>
  </main>;
}
