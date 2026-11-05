import Link from "next/link";
import { notFound } from "next/navigation";
import {
  WorkCaseCards,
  WorkCaseCardAccess,
} from "@/components/terraqo/public-cv-work-cases";
import { publicWorkCaseCards } from "@/lib/terraqo/public-work-case";
import { publicWorkCaseListHref } from "@/lib/terraqo/public-cv-permalink";
import { publishedCvProfileWhere } from "@/lib/terraqo/public-cv";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function WorkList({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ despues?: string | string[] }>;
}) {
  const { username } = await params;
  const after = (await searchParams).despues;
  if (
    after !== undefined &&
    (typeof after !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(after))
  )
    notFound();
  if (
    !(await prisma.terraqoProfessionalProfile.findUnique({
      where: publishedCvProfileWhere(username),
      select: { id: true },
    }))
  )
    notFound();
  const { cards, hasMore } = await publicWorkCaseCards(username, 12, after);
  return (
    <main className="min-h-screen bg-[#07111f] px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <Link
          href={`/cv/${encodeURIComponent(username)}#trabajos`}
          className="inline-flex min-h-11 items-center text-sky-300"
        >
          Volver al CV
        </Link>
        <h1 className="my-5 text-3xl font-semibold">Trabajos agrupados</h1>
        <WorkCaseCardAccess
          username={username}
          page={after ? `desde-${after}` : "inicio"}
          cards={cards}
          hasMore={hasMore}
        >
          <WorkCaseCards cards={cards} username={username} />
          {!cards.length && (
            <p className="text-slate-300">
              No hay trabajos agrupados disponibles.
            </p>
          )}
          {hasMore && (
            <Link
              prefetch={false}
              className="mt-4 inline-flex min-h-11 items-center text-sky-300"
              href={`${publicWorkCaseListHref(username)}?despues=${encodeURIComponent(cards[cards.length - 1].slug)}`}
            >
              Más trabajos
            </Link>
          )}
        </WorkCaseCardAccess>
      </div>
    </main>
  );
}
