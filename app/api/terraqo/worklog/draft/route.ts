import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/authz";
import { isSameOriginMutation } from "@/lib/server/same-origin-mutation";
import { openAccountDraft, writeAccountDraft } from "@/lib/server/worklog-account-draft";
import { draftCommand } from "@/lib/terraqo/worklog-account-draft";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });

async function profileFor(request: Request) {
  const { session } = await requireUser();
  if (!session) return json({ error: "Inicia sesión para acceder al borrador." }, 401);
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  // Bind an old open tab to its displayed profile even if the browser session changes.
  if (!profile || profile.id !== request.headers.get("X-Draft-Profile"))
    return json({ error: "Actualiza la página para acceder a tu perfil." }, 403);
  return profile.id;
}

export async function GET(request: Request) {
  const profile = await profileFor(request);
  if (profile instanceof Response) return profile;
  try {
    return json(await openAccountDraft(profile));
  } catch {
    return json({ error: "No se pudo abrir el borrador privado." }, 503);
  }
}

export async function PUT(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "Origen no permitido." }, 403);
  const profile = await profileFor(request);
  if (profile instanceof Response) return profile;
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Falta el contenido del borrador." }, 400);
  const parts: Uint8Array[] = [];
  let size = 0;
  let payload: unknown;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 128 * 1024) {
        await reader.cancel();
        return json({ error: "El borrador excede el tamaño admitido." }, 413);
      }
      parts.push(value);
    }
    payload = JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    return json({ error: "No se pudo leer el borrador." }, 400);
  } finally {
    reader.releaseLock();
  }
  const command = draftCommand.safeParse(payload);
  if (!command.success) return json({ error: "Revisa la longitud y el formato de los campos." }, 422);
  try {
    const result = await writeAccountDraft(profile, command.data);
    if (result.status === 422)
      return json({ error: "Revisa las copias guardadas. Puedes conservar hasta ocho alternativas." }, 422);
    return json({ draft: result.draft, revision: result.revision }, result.status);
  } catch {
    return json({ error: "No se pudo confirmar el guardado. Vuelve a intentarlo." }, 503);
  }
}
