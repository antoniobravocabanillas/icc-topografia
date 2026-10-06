import type {Role} from "@prisma/client";
import {auth} from "@/auth";
import {prisma} from "@/lib/prisma";
import {getDefaultTerraqoWorkspaceId,hasWorkspaceModule} from "@/lib/terraqo/workspace-scope";
import {getWorkspaceForUser,hasWorkspaceAdminAccess} from "@/lib/terraqo/workspace-access";
import {getWorkspacePortalToken} from "./workspace-portal-session";

/** A quote ID is a locator, never a download credential. Public access requires
 * the current proposal's bearer link; drafts/deleted tenants cannot use it. */
export async function quotePdfScope(request: Request, id: string, getWebSession = () => auth()) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return null;
  const url=new URL(request.url),publicToken=url.searchParams.get("token");
  if (publicToken) {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(publicToken)) return null;
    const quote=await prisma.quote.findFirst({where:{id,publicToken,deletedAt:null,status:{not:"DRAFT"},
      terraqoWorkspace:{active:true,deletedAt:null}},select:{terraqoWorkspaceId:true}});
    return quote && await hasWorkspaceModule("CRM",quote.terraqoWorkspaceId) ? {terraqoWorkspaceId:quote.terraqoWorkspaceId,publicToken,status:{not:"DRAFT" as const}} : null;
  }
  let workspaceId:string,role:"ADMIN"|"CLIENT";
  let userId:string;
  if (request.headers.has("authorization")) {
    const slug=url.searchParams.get("workspace");
    if (!slug || !/^[a-zA-Z0-9_-]{1,100}$/.test(slug)) return null;
    const token=await getWorkspacePortalToken(request,slug);
    if (!token || token.role!=="ADMIN" && token.role!=="CLIENT") return null;
    workspaceId=token.workspaceId;role=token.role;userId=token.sub;
  } else {
    const session=await getWebSession();if (!session?.user?.id) return null;userId=session.user.id;
    const accountRole=session.user.role as Role | undefined;
    if (accountRole && ["SALES","ADMIN","COMMERCIAL_ADMIN","SUPER_ADMIN"].includes(accountRole) && await hasWorkspaceAdminAccess(userId,accountRole)) {
      const workspace=await getWorkspaceForUser(userId,accountRole);if (!workspace?.active) return null;
      workspaceId=workspace.id;role="ADMIN";
    } else {workspaceId=await getDefaultTerraqoWorkspaceId();role="CLIENT";}
  }
  if (!await hasWorkspaceModule("CRM",workspaceId)) return null;
  if (role==="ADMIN") return {terraqoWorkspaceId:workspaceId};
  const account=await prisma.clientAccount.findFirst({where:{userId,terraqoWorkspaceId:workspaceId,deletedAt:null,
    client:{terraqoWorkspaceId:workspaceId,deletedAt:null}},select:{clientId:true}});
  return account?.clientId ? {terraqoWorkspaceId:workspaceId,clientId:account.clientId,status:{not:"DRAFT" as const}} : null;
}
