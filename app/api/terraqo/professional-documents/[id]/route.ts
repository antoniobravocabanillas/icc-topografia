import { prisma } from "@/lib/prisma";
import { fail, handleApiError } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import { getProfessionalDocumentStore } from "@/lib/server/media";

type DocumentRouteProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: DocumentRouteProps) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const { id } = await params;
    const document = await prisma.terraqoProfessionalDocument.findUnique({
      where: { id },
      include: { professionalProfile: { select: { userId: true } } }
    });
    if (!document) return fail("Documento no encontrado.", 404);

    const isOwner = document.professionalProfile.userId === session.user.id;
    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const reviewerMembership = !isOwner && !isSuperAdmin && document.workspaceId
      ? await prisma.terraqoWorkspaceMember.findFirst({
          where: {
            workspaceId: document.workspaceId,
            userId: session.user.id,
            active: true,
            role: { in: ["OWNER", "ADMIN", "MANAGER"] }
          },
          select: { id: true }
        })
      : null;

    if (!isOwner && !isSuperAdmin && !reviewerMembership) return fail("No tienes permiso para ver este documento.", 403);

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
        ETag: entry.etag || ""
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
