import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Download, LockKeyhole, MapPin } from "lucide-react";
import { auth } from "@/auth";
import { getGrantedCollection, ScopedSharingError } from "@/lib/terraqo/scoped-sharing";

export const dynamic = "force-dynamic";

export default async function GrantedSelectionPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.TERRAQO_SCOPED_SHARING_V1 !== "true") notFound();
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/cuenta");
  const { id } = await params;
  const selection = await getGrantedCollection({ userId: session.user.id, userEmail: session.user.email, collectionId: id }).catch((error) => {
    if (error instanceof ScopedSharingError && error.status === 404) notFound();
    throw error;
  });
  return <div className="space-y-7">
    <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-[#071c2d] via-[#0a354d] to-[#0c5b62] p-6 text-white shadow-technical sm:p-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-300"><LockKeyhole className="h-4 w-4" /> Acceso privado</div>
      <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{selection.title}</h1>
      {selection.description ? <p className="mt-3 max-w-3xl leading-7 text-slate-300">{selection.description}</p> : null}
      <p className="mt-5 text-xs text-slate-400">Acceso vigente hasta {new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeStyle: "short" }).format(new Date(selection.expiresAt))}</p>
    </header>
    <div className="grid gap-5">{selection.items.map((item, index) => <article key={`${item.worklogId}-${index}`} className="overflow-hidden rounded-2xl border bg-white shadow-technical"><div className="p-5 sm:p-7">{item.title ? <h2 className="font-display text-2xl font-bold">{item.title}</h2> : null}{item.summary ? <p className="mt-3 leading-7 text-slate-600">{item.summary}</p> : null}{item.outcome ? <div className="mt-4 border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm"><strong>Resultado</strong><p className="mt-1">{item.outcome}</p></div> : null}<div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500">{item.occurredAt ? <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(item.occurredAt))}</span> : null}{item.locationLabel ? <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" />{item.locationLabel}</span> : null}</div></div>{item.media.length ? <div className="grid gap-px border-t bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">{item.media.map((media) => <div key={media.id} className="relative aspect-[4/3] overflow-hidden bg-slate-100"><Image src={media.href} alt="Evidencia autorizada" fill unoptimized sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />{media.downloadHref ? <a href={media.downloadHref} className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-white" aria-label="Descargar archivo"><Download className="h-4 w-4" /></a> : null}</div>)}</div> : null}</article>)}</div>
  </div>;
}
