import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import { SelectionGallery } from "./selection-gallery";
import { SelectionAccessBoundary } from "./selection-access-boundary";
import { selectionAccessSnapshot } from "@/lib/server/selection-access-snapshot";
import type {
  PublicWorkCase,
  PublicWorkCaseCard,
} from "@/lib/terraqo/public-work-case";
import {
  publicCaseRecordHref,
  publicWorkCaseHref,
  publicWorkCaseListHref,
} from "@/lib/terraqo/public-cv-permalink";

const action =
  "inline-flex min-h-11 items-center gap-2 font-semibold text-sky-300 hover:text-white";
const panel = "min-w-0 rounded-xl border border-[#294259] bg-[#0a1927] p-5";

// The App Router can restore a previous server render on Back. Verify its
// card set again before showing cached titles or thumbnails.
export function WorkCaseCardAccess({
  username,
  page,
  cards,
  hasMore,
  children,
}: {
  username: string;
  page: string;
  cards: PublicWorkCaseCard[];
  hasMore?: boolean;
  children: React.ReactNode;
}) {
  const { fingerprint } = selectionAccessSnapshot({ cards, hasMore });
  return (
    <SelectionAccessBoundary
      key={fingerprint}
      fingerprint={fingerprint}
      endpoint={`/api/public/cv/${encodeURIComponent(username)}/trabajos/paginas/${encodeURIComponent(page)}`}
      returnPath={publicWorkCaseListHref(username)}
    >
      {children}
    </SelectionAccessBoundary>
  );
}

export function WorkCaseCards({
  cards,
  username,
}: {
  cards: PublicWorkCaseCard[];
  username: string;
}) {
  return (
    <div className="grid gap-4">
      {cards.map((card) => (
        <article key={card.slug} className={panel}>
          <Link
            href={publicWorkCaseHref(username, card.slug)}
            prefetch={false}
            className="flex items-start gap-4"
          >
            {card.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.image}
                alt=""
                className="h-20 w-20 rounded-lg object-cover"
              />
            ) : (
              <Layers
                aria-hidden="true"
                className="mt-1 shrink-0 text-sky-400"
              />
            )}
            <div className="min-w-0 break-words">
              <h3 className="text-xl font-semibold text-white">{card.title}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {card.count} bitácoras compartidas
              </p>
              {card.description && (
                <p className="mt-2 line-clamp-2 text-slate-300">
                  {card.description}
                </p>
              )}
            </div>
            <ArrowRight
              aria-hidden="true"
              className="ml-auto shrink-0 text-sky-300"
            />
          </Link>
        </article>
      ))}
    </div>
  );
}

export function PublicWorkCaseView({
  username,
  work,
  selected,
}: {
  username: string;
  work: PublicWorkCase;
  selected?: PublicWorkCase["items"][number];
}) {
  const base = publicWorkCaseHref(username, work.slug);
  const endpoint = `/api/public/cv/${encodeURIComponent(username)}/trabajos/${encodeURIComponent(work.slug)}`;
  const { fingerprint } = selectionAccessSnapshot(work);
  const pathFor = (item: PublicWorkCase["items"][number]) =>
    publicCaseRecordHref(username, work.slug, item.worklogId, item.revisionId);
  const label = (item: PublicWorkCase["items"][number]) =>
    item.title || `Bitácora ${work.items.indexOf(item) + 1}`;
  return (
    <main className="min-h-screen bg-[#07111f] px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <Link
          prefetch={false}
          href={selected ? base : publicWorkCaseListHref(username)}
          className={action}
        >
          {selected ? "Volver al trabajo" : "Ver trabajos agrupados"}
        </Link>
        <SelectionAccessBoundary
          key={fingerprint}
          endpoint={endpoint}
          fingerprint={fingerprint}
          returnPath={selected ? pathFor(selected) : base}
        >
          <h1 className="my-5 break-words text-3xl font-semibold">
            {selected ? label(selected) : work.title}
          </h1>
          {selected ? (
            <article className={panel}>
              <SelectionGallery media={selected.media} />
              <dl className="mt-5 grid gap-4">
                {(
                  [
                    [
                      "Fecha",
                      selected.occurredAt &&
                        new Intl.DateTimeFormat("es-PE", {
                          dateStyle: "long",
                          timeZone: "America/Lima",
                        }).format(new Date(selected.occurredAt)),
                    ],
                    ["Ubicación", selected.locationLabel],
                    ["Contribución", selected.summary],
                    ["Resultado", selected.outcome],
                    ["Participación", selected.contributionRole],
                    ["Responsabilidades", selected.responsibilities],
                    ["Métodos", selected.methods],
                    ["Herramientas", selected.tools],
                  ] as const
                ).map(([name, value]) =>
                  value?.length ? (
                    <div key={name}>
                      <dt className="text-sm text-slate-400">{name}</dt>
                      <dd className="mt-1 whitespace-pre-line break-words">
                        {Array.isArray(value) ? value.join("\n") : value}
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </article>
          ) : (
            <>
              {work.description && (
                <p className="mb-6 break-words text-slate-300">
                  {work.description}
                </p>
              )}
              <section
                aria-label="Bitácoras del trabajo"
                className="grid gap-4"
              >
                {work.items.map((item) => (
                  <article key={item.revisionId} className={panel}>
                    {item.media[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.media[0].href}
                        alt=""
                        loading="lazy"
                        className="mb-4 aspect-[2/1] w-full rounded-lg object-cover"
                      />
                    )}
                    <h2 className="break-words text-xl font-semibold">
                      {label(item)}
                    </h2>
                    {item.summary && (
                      <p className="mt-2 line-clamp-3 text-slate-300">
                        {item.summary}
                      </p>
                    )}
                    <Link
                      prefetch={false}
                      href={pathFor(item)}
                      className={action}
                    >
                      Ver bitácora
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  </article>
                ))}
              </section>
            </>
          )}
        </SelectionAccessBoundary>
      </div>
    </main>
  );
}
