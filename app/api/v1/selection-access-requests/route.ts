import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { selectionAccessRequestHandlers } from "@/lib/server/selection-access-request-http";
import { selectionAccessRequestsEnabled, listSelectionAccessRequests, requestSelectionAccess, decideSelectionAccess, resolveRequestedSelectionAccess } from "@/lib/terraqo/selection-access-request";

export const dynamic = "force-dynamic";
const handler = selectionAccessRequestHandlers({
  enabled: selectionAccessRequestsEnabled,
  authenticate: async () => {
    const session = await auth();
    if (!session?.user?.id) return null;
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, emailVerified: true } });
    return user ? { userId: user.id, verified: Boolean(user.emailVerified) } : null;
  },
  list: listSelectionAccessRequests,
  resolve: resolveRequestedSelectionAccess,
  request: requestSelectionAccess,
  decide: decideSelectionAccess,
});
export { handler as GET, handler as POST, handler as PATCH };
