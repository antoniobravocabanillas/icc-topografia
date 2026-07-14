import { notFound } from "next/navigation";
import { ConversionBand } from "@/components/conversion-band";
import { Badge } from "@/components/ui/badge";
import { createBlogPreview, getBlogArticleParagraphs } from "@/lib/blog-content";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

type BlogPostProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: BlogPostProps) {
  const { slug } = await params;
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const post = await prisma.blogPost.findFirst({ where: { slug, terraqoWorkspaceId } });
  if (!post) return {};
  return createMetadata({ title: post.metaTitle || post.title, description: post.metaDesc || post.excerpt, path: `/blog/${post.slug}` });
}

export default async function BlogPostPage({ params }: BlogPostProps) {
  const { slug } = await params;
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const post = await prisma.blogPost.findFirst({ where: { slug, terraqoWorkspaceId } });
  if (!post || !post.publishedAt) notFound();
  const articleParagraphs = getBlogArticleParagraphs(post.excerpt, post.content);
  const summary = createBlogPreview(post.excerpt, post.content, 260);

  return (
    <>
      <article className="container max-w-3xl py-16">
        <Badge variant="outline">{post.category || "Recurso tecnico"}</Badge>
        <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">{post.title}</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">{summary}</p>
        <div className="prose prose-slate mt-10 max-w-none">
          {articleParagraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>)}
        </div>
      </article>
      <ConversionBand />
    </>
  );
}
