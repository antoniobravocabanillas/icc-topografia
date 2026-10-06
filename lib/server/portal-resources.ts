import { listPortalCompanies, savePortalCompany } from "./portal-companies";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import type { WorkspacePortalToken } from "./workspace-portal-session";
import { listProfessionalProfile, updateProfessionalProfile } from "./portal-professional-profile";
import { listCvEntries, saveCvEntry } from "./portal-cv-entries";
import { canChangeProjectClient, portalProjectSelect, writePortalProject } from "./portal-project-write";
import { isProjectOperation, listProjectOperations, saveProjectOperation } from "./portal-project-operations";
import { createPortalTask } from "./portal-task-create";
import { taskFieldsSchema, taskMutation, taskSelect, lockTaskAssignee } from "./portal-task-fields";

import { listPortalContacts, savePortalContact } from "./portal-contacts";

export const resourceCodes = ["companies", "contacts", "contactCompanies", "clients", "leads", "notes", "projectMembers", "milestones", "projectProgress", "operationalProjects", "projects", "projectClients", "tasks", "taskProjects", "taskAssignees", "files", "worklogs", "quotes", "orders", "notifications", "profile", "experiences", "education"] as const;
export type ResourceCode = typeof resourceCodes[number];
export class PortalResourceError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
// Personal workspace files retain the existing portal ownership and quota policy;
// PROJECTS/DOCUMENTS entitlements refer to project documents, a different resource.
const modules = { companies: "CRM", contacts: "CRM", contactCompanies: "CRM", clients: "CRM", leads: "CRM", notes: null, projects: "PROJECTS", operationalProjects: "PROJECTS", projectMembers: "PROJECTS", milestones: "PROJECTS", projectProgress: "PROJECTS", projectClients: "PROJECTS", tasks: "PROJECTS", taskProjects: "PROJECTS", taskAssignees: "PROJECTS", files: null,
  worklogs: "PROFESSIONAL_NETWORK", quotes: "CRM", orders: "TECHNICAL_STORE", notifications: null, profile: "PROFESSIONAL_NETWORK",
  experiences: "PROFESSIONAL_NETWORK", education: "PROFESSIONAL_NETWORK" } as const;
export async function authorizeResource(token: WorkspacePortalToken, resource: ResourceCode) {
  if (["profile", "experiences", "education"].includes(resource) && token.role !== "PROFESSIONAL")
    throw new PortalResourceError("Esta sección requiere tu cuenta profesional.", 403);
  if (["companies", "contacts", "contactCompanies", "clients", "leads", "projectMembers", "milestones", "projectProgress", "operationalProjects", "projects", "projectClients", "tasks", "taskProjects", "taskAssignees"].includes(resource) && token.role !== "ADMIN")
    throw new PortalResourceError("Esta sección requiere administración empresarial.", 403);
  if (["quotes", "orders"].includes(resource) && !["ADMIN", "CLIENT"].includes(token.role))
    throw new PortalResourceError("Tu rol no permite consultar esta sección.", 403);
  if (resource === "worklogs" && !["ADMIN", "PROFESSIONAL"].includes(token.role))
    throw new PortalResourceError("Esta sección requiere un perfil profesional.", 403);
  const entitlementCode = modules[resource];
  if (entitlementCode && !await hasWorkspaceModule(entitlementCode, token.workspaceId))
    throw new PortalResourceError("El módulo no está habilitado para tu empresa.", 403);
}
const nullableText = z.string().trim().max(240).default("");
const clientSchema = z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(254),
  company: nullableText, phone: z.string().trim().max(40).default(""), status: z.string().trim().min(1).max(40) }).strict();
const leadSchema = z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(254),
  company: nullableText, phone: z.string().trim().max(40).default(""), message: z.string().trim().min(1).max(8000),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "EVALUATION", "QUOTED", "NEGOTIATION", "WON", "LOST", "REQUIRES_TECH_SUPPORT"]) }).strict();
const noteSchema = z.object({ title: z.string().trim().min(1).max(140), body: z.string().trim().min(1).max(24000) }).strict();
const clientSelect = { id: true, name: true, email: true, company: true, phone: true, status: true, updatedAt: true } as const;
const leadSelect = { ...clientSelect, message: true } as const;
const noteSelect = { id: true, title: true, body: true, updatedAt: true } as const;
type Row = { id: string; updatedAt: Date; [key: string]: unknown };
function record(row: Row, resource: ResourceCode, actorId?: string, workspaceId?: string) {
  if (resource === "tasks") {
    const { assignedProfile, ...publicRow } = row;
    const profile = assignedProfile as { displayName: string; terraqoWorkspaceId: string } | null | undefined;
    const scoped = profile?.terraqoWorkspaceId === workspaceId && workspaceId !== undefined;
    row = { ...publicRow, assignedProfileId: scoped ? publicRow.assignedProfileId : null,
      assignedProfileName: scoped ? profile!.displayName : "",
      dueDate: row.dueDate instanceof Date ? row.dueDate.toISOString().slice(0, 10) : "" };
  }
  if (resource === 'projects') {
    const {client, companyId, opportunityId, saleId, ...publicRow} = row;
    const customer = client as {id: string; name: string; company: string | null; terraqoWorkspaceId: string | null; deletedAt: Date | null} | null;
    const scoped = !!customer && customer.terraqoWorkspaceId === workspaceId && !customer.deletedAt;
    const editable = workspaceId !== undefined && canChangeProjectClient({clientId: row.clientId as string | null,
      companyId: companyId as string | null, opportunityId: opportunityId as string | null, saleId: saleId as string | null, client: customer}, workspaceId);
    row = {...publicRow, clientId: scoped ? customer.id : '', clientName: scoped ? customer.company || customer.name : '',
      clientLinkEditable: editable, servicesApplied: Array.isArray(row.servicesApplied) ? row.servicesApplied.join('\n') : ''};
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) if (!["id", "updatedAt", "userId"].includes(key)) {
    if (value instanceof Date) fields[key] = value.toISOString();
    else if (value !== null && value !== undefined) fields[key] = String(value);
    else fields[key] = "";
  }
  const title = String(row.title ?? row.name ?? row.number ?? row.customerName ?? "Registro");
  return { id: row.id, title, subtitle: String(row.company ?? row.email ?? row.summary ?? row.body ?? row.location ?? ""),
    status: String(row.status ?? row.evidenceStatus ?? ""), updatedAt: row.updatedAt.toISOString(), fields,
    editable: resource === "projects" ? row.isPublic === false && row.status !== "PUBLISHED" : ["clients", "leads", "notes", "tasks"].includes(resource),
    canDelete: resource === "files" && typeof actorId === "string" && row.userId === actorId };
}
export async function listPortalResource(token: WorkspacePortalToken, resource: ResourceCode, cursor?: string) {
  await authorizeResource(token, resource);
  if (resource === "companies") return listPortalCompanies(token, cursor);
  if (resource === "contacts") return listPortalContacts(token, cursor);
  if (isProjectOperation(resource)) return listProjectOperations(token, resource, cursor);
  if (resource === "profile") return listProfessionalProfile(token);
  if (resource === "experiences" || resource === "education") return listCvEntries(token, resource, cursor);
  const window = { take: 31, orderBy: { id: "asc" as const }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) };
  const tenant = { terraqoWorkspaceId: token.workspaceId, deletedAt: null };
  let rows: Row[];
  switch (resource) {
    case "contactCompanies": {
      const companies = await prisma.company.findMany({...window, where: tenant, select: {id: true, legalName: true, tradeName: true, updatedAt: true}});
      rows = companies.map(company => ({id: company.id, title: company.tradeName || company.legalName, updatedAt: company.updatedAt})); break;
    }
    case "projects": rows = await prisma.project.findMany({ ...window, where: tenant, select: portalProjectSelect }); break;
    case "projectClients": {
      const clients = await prisma.client.findMany({ ...window, where: tenant,
        select: { id: true, name: true, company: true, updatedAt: true } });
      rows = clients.map(client => ({ id: client.id, title: client.company || client.name,
        summary: client.company ? client.name : '', updatedAt: client.updatedAt })); break;
    }
    case "taskAssignees": {
      const people = await prisma.staffProfile.findMany({ ...window, where: { terraqoWorkspaceId: token.workspaceId, active: true },
        select: { id: true, displayName: true, roleTitle: true, updatedAt: true } });
      rows = people.map(person => ({ id: person.id, title: person.displayName, summary: person.roleTitle, updatedAt: person.updatedAt })); break;
    }
    case "operationalProjects": rows = await prisma.project.findMany({ ...window, where: {...tenant, isPublic: false, status: {not: "PUBLISHED"}},
      select: {id: true, title: true, status: true, updatedAt: true} }); break;
    case "taskProjects": rows = await prisma.project.findMany({ ...window, where: tenant,
      select: { id: true, title: true, status: true, updatedAt: true } }); break;
    case "clients": rows = await prisma.client.findMany({ ...window, where: tenant, select: clientSelect }); break;
    case "leads": rows = await prisma.lead.findMany({ ...window, where: tenant, select: leadSelect }); break;
    case "notes": rows = await prisma.terraqoPrivateNote.findMany({ ...window, where: { workspaceId: token.workspaceId, userId: token.sub, kind: "SIMPLE" }, select: noteSelect }); break;
    case "tasks": rows = await prisma.task.findMany({ ...window, where: { deletedAt: null, project: tenant },
      select: taskSelect }); break;
    case "files": rows = await prisma.terraqoWorkspaceFile.findMany({ ...window,
      where: { workspaceId: token.workspaceId, OR: [{ userId: token.sub }, ...(token.role === "ADMIN" ? [{ visibility: "WORKSPACE" as const }] : [])] },
      select: { id: true, userId: true, title: true, description: true, fileName: true, contentType: true, size: true, category: true, visibility: true, updatedAt: true } }); break;
    case "worklogs": rows = await prisma.terraqoWorklogEntry.findMany({ ...window,
      where: { workspaceId: token.workspaceId, deletedAt: null, ...(token.role === "ADMIN" ? {} : { authorId: token.sub }) },
      select: { id: true, title: true, summary: true, outcome: true, evidenceStatus: true, occurredAt: true, updatedAt: true } }); break;
    case "quotes": {
      const account = token.role === "CLIENT" ? await prisma.clientAccount.findFirst({ where: { userId: token.sub, terraqoWorkspaceId: token.workspaceId, deletedAt: null }, select: { clientId: true } }) : null;
      if (token.role === "CLIENT" && !account?.clientId) { rows = []; break; }
      rows = await prisma.quote.findMany({ ...window, where: { ...tenant, ...(token.role === "CLIENT" ? { clientId: account!.clientId! } : {}) },
        select: { id: true, number: true, customerName: true, status: true, currency: true, total: true, validUntil: true, updatedAt: true } }); break;
    }
    case "orders": rows = await prisma.order.findMany({ ...window, where: { terraqoWorkspaceId: token.workspaceId, ...(token.role === "CLIENT" ? { userId: token.sub } : {}) },
      select: { id: true, customerName: true, status: true, currency: true, total: true, notes: true, updatedAt: true } }); break;
    case "notifications": {
      const notifications = await prisma.notification.findMany({ ...window, where: { terraqoWorkspaceId: token.workspaceId, userId: token.sub },
        select: { id: true, title: true, body: true, readAt: true, createdAt: true } });
      rows = notifications.map(row => ({ ...row, updatedAt: row.createdAt, status: row.readAt ? "READ" : "UNREAD" })); break;
    }
  }
  return { schemaVersion: 1, workspaceSlug: token.workspaceSlug, resource,
    records: rows.slice(0, 30).map(row => record(row, resource, token.sub, token.workspaceId)), nextCursor: rows.length > 30 ? rows[29].id : null,
    canCreate: ["clients", "leads", "notes", "projects", "tasks"].includes(resource) };
}

/** Creation IDs are scoped to actor, tenant and operation. A repeated key cannot
 * create a second row; reusing it with different validated input is a conflict. */
export async function savePortalResource(token: WorkspacePortalToken, resource: ResourceCode,
  input: unknown, key: string | null, id?: string, version?: string) {
  await authorizeResource(token, resource);
  if (resource === "companies") return savePortalCompany(token, input, key, id, version);
  if (resource === "contacts") return savePortalContact(token, input, key, id, version);
  if (isProjectOperation(resource)) return saveProjectOperation(token, resource, input, key, id, version);
  if (resource === "notifications") {
    z.object({ action: z.literal("READ") }).strict().parse(input);
    if (!id) throw new PortalResourceError("Selecciona una notificación.", 422);
    const where = { id, userId: token.sub, terraqoWorkspaceId: token.workspaceId };
    // Atomic monotonic transition: concurrent retries preserve the first read time.
    await prisma.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
    const saved = await prisma.notification.findFirst({ where,
      select: { id: true, title: true, body: true, readAt: true, createdAt: true } });
    if (!saved) throw new PortalResourceError("Notificación no disponible.", 404);
    return record({ ...saved, updatedAt: saved.createdAt, status: saved.readAt ? "READ" : "UNREAD" }, resource);
  }
  if (resource === "experiences" || resource === "education") return saveCvEntry(token, resource, input, key, id, version);
  if (resource === "profile") {
    const saved = await updateProfessionalProfile(token, input, id, version);
    if (saved.failure === "missing") throw new PortalResourceError("Perfil no disponible.", 404);
    if (saved.failure === "version") throw new PortalResourceError("El perfil cambió. Recarga antes de editar.", 409);
    return saved.record;
  }
  if (resource === "projects") return record(await writePortalProject(token, input, key, id, version), resource, token.sub, token.workspaceId);
  if (resource === "tasks") {
    if (!id) {
      const saved = await createPortalTask(token, input, key);
      const { projectId: _projectId, ...publicRow } = saved;
      void _projectId;
      return record(publicRow, resource, token.sub, token.workspaceId);
    }
    return saveTask(token, input, id, version);
  }
  if (!["clients", "leads", "notes"].includes(resource)) throw new PortalResourceError("Esta sección no admite edición desde este contrato.", 403);
  if (id && (!version || !z.string().datetime().safeParse(version).success)) throw new PortalResourceError("Actualiza el registro antes de guardarlo.", 409);
  if (!id && (!key || !/^[a-f0-9]{32}$/.test(key))) throw new PortalResourceError("La operación necesita una clave válida.", 422);
  const createdId = id || createHash("sha256").update(JSON.stringify([token.workspaceId, token.sub, resource, key])).digest("hex").slice(0, 32);
  const data = resource === "clients" ? clientSchema.parse(input) : resource === "leads" ? leadSchema.parse(input) : noteSchema.parse(input);
  const where = { id: createdId, ...(resource === "notes" ? { workspaceId: token.workspaceId, userId: token.sub, kind: "SIMPLE" as const } : { terraqoWorkspaceId: token.workspaceId, deletedAt: null }) };
  const existing = resource === "clients" ? await prisma.client.findFirst({ where, select: clientSelect }) : resource === "leads"
    ? await prisma.lead.findFirst({ where, select: leadSelect }) : await prisma.terraqoPrivateNote.findFirst({ where, select: noteSelect });
  if (!id && existing) {
    if (!Object.entries(data).every(([field, value]) => String((existing as Record<string, unknown>)[field] ?? "") === String(value)))
      throw new PortalResourceError("La clave de operación ya fue utilizada con otros datos.", 409);
    return record(existing, resource);
  }
  if (id && !existing) throw new PortalResourceError("Registro no disponible.", 404);
  if (id) {
    const guarded = { ...where, updatedAt: new Date(version!) };
    // Compare-and-swap prevents a stale device from overwriting a newer edit.
    const result = resource === "clients" ? await prisma.client.updateMany({ where: guarded, data: data as z.infer<typeof clientSchema> }) : resource === "leads"
      ? await prisma.lead.updateMany({ where: guarded, data: data as z.infer<typeof leadSchema> }) : await prisma.terraqoPrivateNote.updateMany({ where: guarded, data: data as z.infer<typeof noteSchema> });
    if (result.count !== 1) throw new PortalResourceError("Otro usuario actualizó este registro. Recarga antes de editar.", 409);
    const saved = resource === "clients" ? await prisma.client.findFirst({ where, select: clientSelect }) : resource === "leads"
      ? await prisma.lead.findFirst({ where, select: leadSelect }) : await prisma.terraqoPrivateNote.findFirst({ where, select: noteSelect });
    if (!saved) throw new PortalResourceError("Registro no disponible.", 404);
    return record(saved, resource);
  }
  try {
    const saved = resource === "clients" ? await prisma.client.create({ data: { id: createdId, terraqoWorkspaceId: token.workspaceId, ...data as z.infer<typeof clientSchema> }, select: clientSelect }) : resource === "leads"
      ? await prisma.lead.create({ data: { id: createdId, terraqoWorkspaceId: token.workspaceId, ...data as z.infer<typeof leadSchema> }, select: leadSelect })
      : await prisma.terraqoPrivateNote.create({ data: { id: createdId, workspaceId: token.workspaceId, userId: token.sub, ...data as z.infer<typeof noteSchema> }, select: noteSelect });
    return record(saved, resource);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new PortalResourceError("La operación ya existe. Recarga para revisar el resultado antes de volver a guardar.", 409);
    throw error;
  }
}

async function saveTask(token: WorkspacePortalToken, input: unknown, id?: string, version?: string) {
  if (!id) throw new PortalResourceError("Selecciona una tarea existente para editarla.", 422);
  if (!version || !z.string().datetime().safeParse(version).success)
    throw new PortalResourceError("Actualiza la tarea antes de guardarla.", 409);
  const data = taskMutation(taskFieldsSchema.parse(input));
  const where = { id, deletedAt: null, project: { terraqoWorkspaceId: token.workspaceId, deletedAt: null } };
  return prisma.$transaction(async tx => {
    const current = await tx.task.findFirst({ where, select: { ...taskSelect, projectId: true } });
    if (!current) throw new PortalResourceError("Tarea no disponible.", 404);
    if (data.assignedProfileId && data.assignedProfileId !== current.assignedProfileId &&
      !await lockTaskAssignee(tx, token.workspaceId, data.assignedProfileId))
      throw new PortalResourceError("Responsable no disponible para esta empresa.", 422);
    // Completion and audit are committed together. Reopening clears completion;
    // editing an already completed task preserves its original completion time.
    const changed = await tx.task.updateMany({ where: { ...where, updatedAt: new Date(version) },
      data: { ...data, completedAt: data.status === "DONE" ? current.completedAt ?? new Date() : null } });
    if (changed.count !== 1) throw new PortalResourceError("La tarea cambió. Recarga antes de editar.", 409);
    await tx.activityLog.create({ data: { actorId: token.sub, terraqoWorkspaceId: token.workspaceId,
      projectId: current.projectId, taskId: id, entityType: "Task", entityId: id,
      action: current.status === data.status ? "UPDATED" : "STATUS_CHANGED", title: "Tarea actualizada",
      metadata: { previousStatus: current.status, status: data.status, source: "portal" } } });
    const saved = await tx.task.findFirst({ where, select: taskSelect });
    if (!saved) throw new PortalResourceError("Tarea no disponible.", 404);
    return record(saved, "tasks", token.sub, token.workspaceId);
  });
}
