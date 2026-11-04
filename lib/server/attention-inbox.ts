import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageAdmin, requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule, hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";
const take = 25;
export async function loadAttentionInbox(params: Record<string, string | string[] | undefined>) {
  const session = await requireAdminPage(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"]);
  const canManage = canManageAdmin(session.user.role as Role);
  const workspaceId = await getSessionTerraqoWorkspaceId();
  await requireWorkspaceModule("CUSTOMER_CHAT", workspaceId);

  const param = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const q = param("q").trim().slice(0, 120);
  const filter = ["open", "unassigned", "resolved", "all"].includes(param("filter")) ? param("filter") : "open";
  const page = Math.min(10000, Math.max(1, Number.parseInt(param("page"), 10) || 1));
  const panel = param("panel") === "context" ? "context" : "conversation";
  const selectedId = param("conversation").slice(0, 160);
  const historyPage = Math.min(10000, Math.max(1, Number.parseInt(param("history"), 10) || 1));
  const profile = await prisma.staffProfile.findFirst({ where: { userId: session.user.id, terraqoWorkspaceId: workspaceId, active: true }, select: { id: true } });
  const scope: Prisma.ChatConversationWhereInput = { terraqoWorkspaceId: workspaceId, ...(!canManage ? { OR: [{ assignedToId: session.user.id }, ...(profile ? [{ assignedProfileId: profile.id }] : [])] } : {}) };
  const where: Prisma.ChatConversationWhereInput = { AND: [scope,
    filter === "resolved" ? { status: "CLOSED" } : filter === "all" ? {} : { status: { not: "CLOSED" } },
    filter === "unassigned" ? { assignedToId: null, assignedProfileId: null } : {},
    q ? { OR: ["customerName", "customerEmail", "customerPhone", "topic"].map(field => ({ [field]: { contains: q, mode: "insensitive" } })) } : {},
  ] };
  const [conversations, total, open, unassigned, profiles] = await Promise.all([
    prisma.chatConversation.findMany({ where, select: { id: true, nextAction: true, nextActionAt: true, nextActionCompletedAt: true, customerName: true, topic: true, status: true, updatedAt: true, assignedProfile: { select: { displayName: true } }, assignedTo: { select: { name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, sender: true, createdAt: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take, skip: (page - 1) * take }),
    prisma.chatConversation.count({ where }),
    prisma.chatConversation.count({ where: { AND: [scope, { status: { not: "CLOSED" } }] } }),
    prisma.chatConversation.count({ where: { AND: [scope, { status: { not: "CLOSED" }, assignedToId: null, assignedProfileId: null }] } }),
    canManage ? prisma.staffProfile.findMany({ where: { terraqoWorkspaceId: workspaceId, active: true }, select: { id: true, displayName: true, roleTitle: true }, orderBy: { displayName: "asc" } }) : Promise.resolve([]),
  ]);
  const selected = selectedId ? await prisma.chatConversation.findFirst({ where: { AND: [scope, { id: selectedId }] }, select: {
    id: true, nextAction: true, nextActionAt: true, nextActionCompletedAt: true, customerName: true, customerEmail: true, customerPhone: true, topic: true, status: true, createdAt: true, assignedProfileId: true, assignedToId: true,
    assignedProfile: { select: { displayName: true, roleTitle: true } }, assignedTo: { select: { name: true } },
    messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, skip: (historyPage - 1) * 100, select: { id: true, sender: true, body: true, createdAt: true } },
    _count: { select: { messages: true } },
  } }) : null;
  const canCommercial = ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"].includes(session.user.role || "") && await hasWorkspaceModule("CRM", workspaceId);
  const [companies, opportunities, linked] = canCommercial && selected ? await Promise.all([
    prisma.company.findMany({ where: { terraqoWorkspaceId: workspaceId, deletedAt: null }, select: { id: true, legalName: true }, orderBy: { legalName: "asc" }, take: 100 }),
    prisma.opportunity.findMany({ where: { terraqoWorkspaceId: workspaceId, deletedAt: null }, select: { id: true, title: true, code: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
    prisma.activityLog.findMany({ where: { terraqoWorkspaceId: workspaceId, entityType: "ChatConversation", entityId: selected.id, action: "CONVERTED", opportunity: { terraqoWorkspaceId: workspaceId, deletedAt: null } }, select: { id: true, title: true, opportunity: { select: { id: true, title: true, status: true, _count: { select: { quotes: true, sales: true } } } } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]) : [[], [], []];
  const notes = selected ? await prisma.activityLog.findMany({ where: { terraqoWorkspaceId: workspaceId, entityType: "ChatConversation", entityId: selected.id, title: "Nota interna", action: "COMMENTED" }, select: { id: true, body: true, createdAt: true, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 }) : [];
  const outcomes = selected && canCommercial ? await prisma.activityLog.findMany({ where: { terraqoWorkspaceId: workspaceId, entityType: "ChatConversation", entityId: selected.id, action: "UPDATED", title: { in: ["Venta declarada por el equipo", "Oportunidad perdida"] }, opportunity: { terraqoWorkspaceId: workspaceId, deletedAt: null } }, select: { id: true, title: true, body: true, createdAt: true, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 }) : [];
  return { outcomes, panel, canCommercial, companies, opportunities, linked, notes, q, filter, page, selectedId, canManage, conversations, total, open, unassigned, profiles, selected, historyPage };
}
