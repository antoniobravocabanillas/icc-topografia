import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleApiError, ok, parseJson, slugify } from "@/lib/server/api";
import { requireRole } from "@/lib/server/authz";
import { idSchema } from "@/lib/validations/common";
import { postUpdateSchema } from "@/lib/validations/content";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

type PostAdminRouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: PostAdminRouteProps) {
  const { response } = await requireRole("EDITOR");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);
    const owned = await prisma.blogPost.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return ok({ error: "Post no encontrado" }, { status: 404 });
    const payload = await parseJson(request, postUpdateSchema);
    const post = await prisma.blogPost.update({
      where: { id },
      data: {
        ...payload,
        slug: payload.slug ?? (payload.title ? slugify(payload.title) : undefined),
        content: payload.content as Prisma.InputJsonValue | undefined
      }
    });
    return ok(post);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: PostAdminRouteProps) {
  const { response } = await requireRole("ADMIN");
  if (response) return response;

  try {
    const { id } = idSchema.parse(await params);
    const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
    await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);
    const owned = await prisma.blogPost.findFirst({ where: { id, terraqoWorkspaceId }, select: { id: true } });
    if (!owned) return ok({ error: "Post no encontrado" }, { status: 404 });
    await prisma.blogPost.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
