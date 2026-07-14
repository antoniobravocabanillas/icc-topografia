import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { created, getPagination, handleApiError, paginated, parseJson, slugify } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { postInputSchema } from "@/lib/validations/content";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export async function GET(request: Request) {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = getPagination(searchParams);
    const [posts, total] = await prisma.$transaction([
      prisma.blogPost.findMany({ where: { terraqoWorkspaceId }, orderBy: { updatedAt: "desc" }, skip, take }),
      prisma.blogPost.count({ where: { terraqoWorkspaceId } })
    ]);

    return paginated(posts, { page, pageSize, total, pageCount: Math.ceil(total / pageSize) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    const payload = await parseJson(request, postInputSchema);
    const post = await prisma.blogPost.create({
      data: { ...payload, terraqoWorkspaceId, slug: payload.slug ?? slugify(payload.title), content: payload.content as Prisma.InputJsonValue }
    });
    return created(post);
  } catch (error) {
    return handleApiError(error);
  }
}
