import "server-only";
import { prisma } from "../prisma";
import { getWorkspacePortalToken } from "./workspace-portal-session";
import { handleNativeWorklogOperation } from "./native-worklog-http";
import { createNativeWorklog, readNativeWorklog } from "./native-worklog-operation";

/** Fixed composition: no client-selected database, actor, budget or award caller.
 * SQL repeats current authority and schema checks inside the same transaction.
 * A creation receipt never claims that reputation accounting has been applied.
 */
export function handleNativeWorklogPortal(request: Request, workspaceSlug: string) {
  return handleNativeWorklogOperation(request, workspaceSlug, {
    authenticate: getWorkspacePortalToken,
    create: (parsed, token, budget) => createNativeWorklog(prisma, token, parsed, budget),
    read: (token, key, budget) => readNativeWorklog(prisma, token, key, budget),
  });
}
