import { created, fail, handleApiError, parseJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { prisma } from "@/lib/prisma";
import { canViewWorklog } from "@/lib/terraqo/worklog";
import { terraqoWorklogEngagementSchema } from "@/lib/validations/terraqo";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const { id } = await params;
    const worklog = await canViewWorklog(session.user.id, id);
    if (!worklog) return fail("La publicacion no existe o no es visible para tu perfil.", 404);

    const payload = await parseJson(request, terraqoWorklogEngagementSchema);
    if (payload.action === "comment") {
      return created(await prisma.terraqoWorklogComment.create({
        data: { worklogId: id, authorId: session.user.id, body: payload.body },
        include: { author: { select: { id: true, name: true, image: true } } }
      }));
    }

    const existing = await prisma.terraqoWorklogReaction.findUnique({
      where: { worklogId_userId: { worklogId: id, userId: session.user.id } },
      select: { id: true, type: true }
    });

    if (existing?.type === payload.type) {
      await prisma.terraqoWorklogReaction.delete({ where: { id: existing.id } });
      return created({ removed: true });
    }

    return created(await prisma.terraqoWorklogReaction.upsert({
      where: { worklogId_userId: { worklogId: id, userId: session.user.id } },
      update: { type: payload.type },
      create: { worklogId: id, userId: session.user.id, type: payload.type }
    }));
  } catch (error) {
    return handleApiError(error);
  }
}
