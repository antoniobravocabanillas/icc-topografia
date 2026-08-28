import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/server/api";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return fail("Autenticación requerida", 401);

  const now = new Date();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastSeenAt: now, onlineUntil: new Date(now.getTime() + ONLINE_WINDOW_MS) }
  });
  return ok({ online: true, onlineUntil: new Date(now.getTime() + ONLINE_WINDOW_MS).toISOString() });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return ok({ online: false });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastSeenAt: new Date(), onlineUntil: new Date(0) }
  });
  return ok({ online: false });
}
