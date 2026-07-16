import { prisma } from "@/lib/prisma";
import { fail, handleApiError } from "@/lib/server/api";
import { getProfessionalDocumentStore } from "@/lib/server/media";
import { getWorkspacePortalToken } from "@/lib/server/workspace-portal-session";

type RouteContext = { params: Promise<{ workspaceSlug: string; id: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params;
    const token = getWorkspacePortalToken(request, workspaceSlug);
    if (!token) return fail("La sesion no es valida o ha vencido.", 401);

    const document = await prisma.terraqoProfessionalDocument.findFirst({
      where: { id, workspaceId: token.workspaceId },
      include: { professionalProfile: { select: { userId: true } } },
    });
    if (!document) return fail("Documento no encontrado.", 404);

    const isOwner = document.professionalProfile.userId === token.sub;
    const reviewerMembership = !isOwner
      ? await prisma.terraqoWorkspaceMember.findFirst({
          where: {
            workspaceId: token.workspaceId,
            userId: token.sub,
            active: true,
            role: { in: ["OWNER", "ADMIN", "MANAGER"] },
          },
          select: { id: true },
        })
      : null;
    if (!isOwner && !reviewerMembership) return fail("No tienes permiso para ver este documento.", 403);

    const entry = await getProfessionalDocumentStore().getWithMetadata(document.storageKey, { type: "arrayBuffer" });
    if (!entry) return fail("El archivo ya no esta disponible.", 404);

    const safeName = document.fileName.replace(/[\r\n"]/g, "-");
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    return new Response(entry.data, {
      headers: {
        "Content-Type": document.contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        ETag: entry.etag || "",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
