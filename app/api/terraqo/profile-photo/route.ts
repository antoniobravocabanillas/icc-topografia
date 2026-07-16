import { ok, fail, handleApiError } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";
import {
  ALLOWED_PROFESSIONAL_AVATAR_TYPES,
  createProfessionalAvatarKey,
  getProfessionalAvatarStore,
  MAX_PROFESSIONAL_AVATAR_SIZE
} from "@/lib/server/media";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;

  try {
    const profile = await prisma.terraqoProfessionalProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    });
    if (!profile) return fail("Perfil profesional no encontrado.", 404);

    const formData = await request.formData();
    const value = formData.get("photo");
    if (!(value instanceof File) || !value.size) return fail("Selecciona una foto de perfil.", 400);
    if (!ALLOWED_PROFESSIONAL_AVATAR_TYPES.has(value.type)) return fail("Usa una imagen JPG, PNG, WebP o AVIF.", 400);
    if (value.size > MAX_PROFESSIONAL_AVATAR_SIZE) return fail("La foto debe pesar como maximo 3 MB.", 400);

    const key = createProfessionalAvatarKey(session.user.id, value.name);
    const store = getProfessionalAvatarStore();
    await store.set(key, await value.arrayBuffer(), {
      metadata: {
        contentType: value.type,
        originalName: value.name,
        userId: session.user.id,
        uploadedAt: new Date().toISOString()
      }
    });

    const image = `/api/media/${key}`;
    await prisma.user.update({ where: { id: session.user.id }, data: { image } });
    return ok({ image });
  } catch (error) {
    return handleApiError(error);
  }
}
