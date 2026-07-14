import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

type CmsPublicPageProps = { params: Promise<{ slug: string }> };

type CmsContent = {
  body?: string;
  blocks?: Array<{ title?: string; body?: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: CmsPublicPageProps) {
  const { slug } = await params;
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const page = await prisma.cmsPage.findFirst({ where: { slug, isPublished: true, terraqoWorkspaceId } });
  if (!page) return {};
  return createMetadata({
    title: page.metaTitle || page.title,
    description: page.metaDesc || page.title,
    path: `/${page.slug}`
  });
}

export default async function CmsPublicPage({ params }: CmsPublicPageProps) {
  const { slug } = await params;
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const page = await prisma.cmsPage.findFirst({ where: { slug, isPublished: true, terraqoWorkspaceId } });
  if (!page) notFound();

  const content = page.content as CmsContent;

  return (
    <section className="container py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase text-primary">ICC Topografia</p>
        <h1 className="mt-3 font-display text-4xl font-bold md:text-5xl">{page.title}</h1>
      </div>

      <Card className="mt-8 max-w-4xl">
        <CardContent className="space-y-6 p-6 text-base leading-8 text-muted-foreground">
          {content.body ? <p className="whitespace-pre-line">{content.body}</p> : null}
          {content.blocks?.map((block) => (
            <section key={`${block.title}-${block.body}`} className="space-y-2">
              {block.title ? <h2 className="font-display text-2xl font-bold text-foreground">{block.title}</h2> : null}
              {block.body ? <p className="whitespace-pre-line">{block.body}</p> : null}
            </section>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
