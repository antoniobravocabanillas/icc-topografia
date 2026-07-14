import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { slugParamSchema } from "@/lib/validations/common";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

type BlogRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: BlogRouteProps) {
  try {
    const { slug } = slugParamSchema.parse(await params);
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    const post = await prisma.blogPost.findFirst({ where: { slug, terraqoWorkspaceId } });
    if (!post?.publishedAt) return fail("Post no encontrado", 404);
    return ok(post);
  } catch (error) {
    return handleApiError(error);
  }
}
