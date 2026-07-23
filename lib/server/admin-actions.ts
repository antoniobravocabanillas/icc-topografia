"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ActivityAction, BotQuestionStatus, CommissionType, Prisma, Role, StaffDepartment, TechnicalAvailability, TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/server/api";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { getWorkspaceForUser, hasWorkspaceAdminAccess } from "@/lib/terraqo/workspace-access";

function value(formData: FormData, key: string) {
  const input = formData.get(key);
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function contentFromText(formData: FormData) {
  const body = value(formData, "content") || value(formData, "body") || "";
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? parsed : { body };
  } catch {
    return { body };
  }
}

function listFromTextarea(formData: FormData, key: string) {
  return (value(formData, key) || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function serviceFieldsFromForm(formData: FormData, title: string) {
  return {
    title,
    slug: value(formData, "slug") || slugify(title),
    category: value(formData, "category"),
    categoryId: value(formData, "categoryId"),
    subcategoryId: value(formData, "subcategoryId"),
    isFeatured: checked(formData, "isFeatured"),
    status: value(formData, "status") || "ACTIVE",
    icon: value(formData, "icon"),
    cover: value(formData, "cover"),
    gallery: listFromTextarea(formData, "gallery"),
    video: value(formData, "video"),
    headline: value(formData, "headline"),
    summary: value(formData, "summary") || "",
    benefits: listFromTextarea(formData, "benefits"),
    applications: listFromTextarea(formData, "applications"),
    deliverables: listFromTextarea(formData, "deliverables"),
    technologies: listFromTextarea(formData, "technologies"),
    precision: value(formData, "precision"),
    formats: listFromTextarea(formData, "formats"),
    compatibility: listFromTextarea(formData, "compatibility"),
    seoTitle: value(formData, "seoTitle"),
    metaDescription: value(formData, "metaDescription"),
    ogImage: value(formData, "ogImage"),
    relatedProjects: listFromTextarea(formData, "relatedProjects"),
    successCases: listFromTextarea(formData, "successCases"),
    relatedServices: listFromTextarea(formData, "relatedServices"),
    sectorSlugs: listFromTextarea(formData, "sectorSlugs"),
    content: contentFromText(formData) as Prisma.InputJsonValue,
    isPublished: checked(formData, "isPublished")
  };
}

function serviceCategoryFieldsFromForm(formData: FormData) {
  const name = value(formData, "name") || "";
  return {
    name,
    slug: value(formData, "slug") || slugify(name),
    description: value(formData, "description"),
    icon: value(formData, "icon"),
    seoTitle: value(formData, "seoTitle") || name,
    metaDescription: value(formData, "metaDescription") || value(formData, "description"),
    position: numberValue(formData, "position"),
    active: checked(formData, "active"),
    parentId: value(formData, "parentId")
  };
}

function sectorFieldsFromForm(formData: FormData) {
  const name = value(formData, "name") || "";
  return {
    name,
    slug: value(formData, "slug") || slugify(name),
    description: value(formData, "description") || "",
    icon: value(formData, "icon"),
    image: value(formData, "image"),
    position: numberValue(formData, "position"),
    active: checked(formData, "active"),
    seoTitle: value(formData, "seoTitle") || name,
    metaDescription: value(formData, "metaDescription") || value(formData, "description")
  };
}

function adminErrorRedirect(message: string) {
  redirect(`/admin/proyectos?projectStatus=error&item=${encodeURIComponent(message)}`);
}

const projectAdminRoles: Role[] = ["EDITOR", "ADMIN", "SUPER_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT"];
const contentAdminRoles: Role[] = ["EDITOR", "ADMIN", "SUPER_ADMIN"];

function staffToolsFromForm(formData: FormData) {
  return {
    whatsappTemplate: value(formData, "whatsappTemplate") || "",
    checklist: listFromTextarea(formData, "checklist"),
    nextSteps: listFromTextarea(formData, "nextSteps")
  };
}

function staffCommercialFieldsFromForm(formData: FormData) {
  return {
    avatar: value(formData, "avatar"),
    commissionType: (value(formData, "commissionType") as CommissionType | undefined) || "SALE_PERCENTAGE",
    commissionRate: numberValue(formData, "commissionRate", 5),
    fixedCommission: numberValue(formData, "fixedCommission"),
    monthlyGoal: numberValue(formData, "monthlyGoal"),
    territory: value(formData, "territory"),
    internalNotes: value(formData, "internalNotes")
  };
}

function staffTechnicalFieldsFromForm(formData: FormData) {
  return {
    availability: (value(formData, "availability") as TechnicalAvailability | undefined) || "AVAILABLE",
    workZone: value(formData, "workZone"),
    experience: value(formData, "experience"),
    certifications: listFromTextarea(formData, "certifications"),
    documents: listFromTextarea(formData, "documents")
  };
}

async function requireActionRole(allowedRoles: Role[]) {
  const session = await auth();
  const role = session?.user?.role as Role | undefined;

  if (!session?.user?.id || !role || !allowedRoles.includes(role)) {
    throw new Error("Permisos insuficientes.");
  }

  if (!(await hasWorkspaceAdminAccess(session.user.id, role))) {
    throw new Error("Acceso no autorizado para este workspace.");
  }

  const activeWorkspace = await getWorkspaceForUser(session.user.id, role);
  if (!activeWorkspace?.active) throw new Error("Workspace inexistente o inactivo.");

  return { session, role, workspaceId: activeWorkspace.id };
}

async function requireOwnedEntity(label: string, record: Promise<{ id: string } | null>) {
  const ownedRecord = await record;
  if (!ownedRecord) throw new Error(`${label} no pertenece al workspace activo.`);
  return ownedRecord;
}

async function existingUserId(userId?: string | null) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }
  });
  return user?.id || null;
}

function roleFromForm(formData: FormData) {
  const role = value(formData, "role") as Role | undefined;
  return role && ["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"].includes(role) ? role : "SALES";
}

function numberValue(formData: FormData, key: string, fallback = 0) {
  const raw = value(formData, key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateValue(formData: FormData, key: string) {
  const raw = value(formData, key);
  return raw ? new Date(raw) : undefined;
}

function nullableValue(formData: FormData, key: string) {
  return value(formData, key) || null;
}

function ticketClosedAt(status?: string) {
  return status === "CLOSED" || status === "RESOLVED" ? new Date() : null;
}

function opportunityCode() {
  const now = new Date();
  return `OPP-${now.getFullYear()}-${String(now.getTime()).slice(-7)}`;
}

function saleNumber() {
  const now = new Date();
  return `SALE-${now.getFullYear()}-${String(now.getTime()).slice(-7)}`;
}

async function createActivityLog(data: {
  action: ActivityAction;
  entityType: string;
  entityId: string;
  title: string;
  body?: string;
  companyId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  quoteId?: string | null;
  saleId?: string | null;
  projectId?: string | null;
  ticketId?: string | null;
  terraqoWorkspaceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const session = await auth();
  const sessionWorkspaceId = await getSessionTerraqoWorkspaceId();
  const { terraqoWorkspaceId: requestedWorkspaceId, ...activityData } = data;

  if (requestedWorkspaceId && requestedWorkspaceId !== sessionWorkspaceId) {
    throw new Error("El registro de actividad no pertenece al workspace activo");
  }

  await prisma.activityLog.create({
    data: {
      actorId: session?.user?.id,
      ...activityData,
      terraqoWorkspaceId: sessionWorkspaceId
    }
  });
}

function nullableNumberValue(formData: FormData, key: string) {
  const raw = value(formData, key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function upsertCompanyAndContactFromForm(formData: FormData) {
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  const companyName = value(formData, "company") || value(formData, "companyName");
  const contactEmail = value(formData, "customerEmail") || value(formData, "email");
  const contactName = value(formData, "customerName") || value(formData, "name");
  if (!companyName && !contactEmail && !contactName) return { company: null, contact: null };

  const explicitCompanyId = value(formData, "companyId");
  const document = value(formData, "document");
  const companyLookup = [
    document ? { document } : undefined,
    companyName ? { legalName: companyName } : undefined,
    companyName ? { tradeName: companyName } : undefined,
    contactEmail ? { email: contactEmail } : undefined
  ].filter(Boolean) as Prisma.CompanyWhereInput[];
  const existing = explicitCompanyId
    ? await prisma.company.findFirst({ where: { id: explicitCompanyId, terraqoWorkspaceId } })
    : companyLookup.length
      ? await prisma.company.findFirst({
        where: {
          terraqoWorkspaceId,
          deletedAt: null,
          OR: companyLookup
        }
      })
      : null;

  const company = existing
    ? await prisma.company.update({
        where: { id: existing.id },
        data: {
          tradeName: companyName || existing.tradeName,
          document: document || existing.document,
          email: contactEmail || existing.email,
          phone: value(formData, "phone") || existing.phone,
          terraqoWorkspaceId: existing.terraqoWorkspaceId || terraqoWorkspaceId
        }
      })
    : await prisma.company.create({
        data: {
          legalName: companyName || contactName || contactEmail || "Empresa sin nombre",
          tradeName: companyName,
          document,
          email: contactEmail,
          phone: value(formData, "phone"),
          terraqoWorkspaceId
        }
      });

  const contact = contactEmail || contactName
    ? await prisma.contact.upsert({
        where: { companyId_email: { companyId: company.id, email: contactEmail || "" } },
        update: {
          name: contactName || contactEmail || "Contacto",
          phone: value(formData, "phone")
        },
        create: {
          companyId: company.id,
          terraqoWorkspaceId,
          name: contactName || contactEmail || "Contacto",
          email: contactEmail,
          phone: value(formData, "phone"),
          whatsapp: value(formData, "phone"),
          isPrimary: true
        }
      }).catch(async () => prisma.contact.create({
        data: {
          companyId: company.id,
          terraqoWorkspaceId,
          name: contactName || contactEmail || "Contacto",
          email: contactEmail,
          phone: value(formData, "phone"),
          whatsapp: value(formData, "phone"),
          isPrimary: true
        }
      }))
    : null;

  return { company, contact };
}

async function upsertCompanyAndContactFromLead(leadId: string) {
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  const lead = await prisma.lead.findFirst({ where: { id: leadId, terraqoWorkspaceId } });
  if (!lead) throw new Error("Lead no encontrado.");
  if (lead.companyId) {
    const company = await prisma.company.findFirst({ where: { id: lead.companyId, terraqoWorkspaceId } });
    const contact = lead.contactId ? await prisma.contact.findFirst({ where: { id: lead.contactId, terraqoWorkspaceId } }) : null;
    return { lead, company, contact };
  }
  const company = await prisma.company.create({
    data: {
      legalName: lead.company || lead.name,
      tradeName: lead.company,
      email: lead.email,
      phone: lead.phone,
      status: "prospecto",
      terraqoWorkspaceId
    }
  });
  const contact = await prisma.contact.create({
    data: {
      companyId: company.id,
      terraqoWorkspaceId,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      whatsapp: lead.phone,
      isPrimary: true
    }
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { companyId: company.id, contactId: contact.id }
  });
  return { lead, company, contact };
}

async function upsertClientFromContact(formData: FormData) {
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  const email = value(formData, "customerEmail") || value(formData, "email");
  const name = value(formData, "customerName") || value(formData, "name") || "Cliente sin nombre";
  if (!email) return null;
  const { company, contact } = await upsertCompanyAndContactFromForm(formData);

  const existingClient = await prisma.client.findFirst({
    where: { email, terraqoWorkspaceId, deletedAt: null }
  });
  const client = existingClient
    ? await prisma.client.update({
      where: { id: existingClient.id },
      data: {
      name,
      company: value(formData, "company"),
      phone: value(formData, "phone"),
      companyId: company?.id,
      terraqoWorkspaceId
      }
    })
    : await prisma.client.create({
      data: {
      name,
      email,
      company: value(formData, "company"),
      phone: value(formData, "phone"),
      contactName: name,
      companyId: company?.id,
      terraqoWorkspaceId
      }
    });

  if (company) {
    const existingAccount = await prisma.clientAccount.findFirst({
      where: { clientId: client.id, terraqoWorkspaceId }
    });
    if (existingAccount) {
      await prisma.clientAccount.update({
        where: { id: existingAccount.id },
        data: {
        companyId: company.id,
        contactId: contact?.id,
        terraqoWorkspaceId
        }
      });
    } else {
      await prisma.clientAccount.create({
        data: {
        clientId: client.id,
        userId: client.userId,
        companyId: company.id,
        contactId: contact?.id,
        terraqoWorkspaceId,
        status: client.userId ? "active" : "invited",
        invitedAt: client.userId ? null : new Date()
        }
      });
    }
  }

  return client;
}

export async function deleteLeadAction(id: string) {
  const { workspaceId } = await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Lead", prisma.lead.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  await createActivityLog({
    action: "DELETED",
    entityType: "Lead",
    entityId: id,
    leadId: id,
    title: "Lead archivado",
    body: "El lead fue marcado como eliminado sin borrar historial.",
    terraqoWorkspaceId: workspaceId
  });
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
}

export async function updateLeadStatusAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Lead", prisma.lead.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const status = value(formData, "status") as "NEW" | "CONTACTED" | "QUALIFIED" | "EVALUATION" | "QUOTED" | "NEGOTIATION" | "WON" | "LOST" | "REQUIRES_TECH_SUPPORT";
  await prisma.lead.update({ where: { id }, data: { status } });
  revalidatePath("/admin/leads");
}

export async function updateLeadPipelineAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Lead", prisma.lead.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const assignedProfileId = value(formData, "assignedProfileId");
  await prisma.lead.update({
    where: { id },
    data: {
      status: value(formData, "status") as "NEW" | "CONTACTED" | "QUALIFIED" | "EVALUATION" | "QUOTED" | "NEGOTIATION" | "WON" | "LOST" | "REQUIRES_TECH_SUPPORT",
      priority: value(formData, "priority") as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      assignedProfileId: assignedProfileId || null,
      interest: value(formData, "interest"),
      estimatedValue: numberValue(formData, "estimatedValue"),
      nextFollowUpAt: dateValue(formData, "nextFollowUpAt") || null
    }
  });
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
}

export async function createLeadNoteAction(id: string, formData: FormData) {
  const { session, workspaceId } = await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Lead", prisma.lead.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const body = value(formData, "body");
  if (!body) return;
  await prisma.leadNote.create({
    data: {
      leadId: id,
      authorId: session.user.id,
      body
    }
  });
  revalidatePath("/admin/leads");
}

export async function convertLeadToOpportunityAction(id: string) {
  const { workspaceId } = await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireWorkspaceModule("CRM", workspaceId);
  const { lead, company, contact } = await upsertCompanyAndContactFromLead(id);
  if (!company) throw new Error("No se pudo crear empresa para la oportunidad.");
  const existing = await prisma.opportunity.findFirst({ where: { leadId: id, terraqoWorkspaceId: workspaceId } });
  if (existing) {
    revalidatePath("/admin/oportunidades");
    return;
  }

  const opportunity = await prisma.opportunity.create({
    data: {
      code: opportunityCode(),
      title: lead.interest || `Oportunidad - ${lead.company || lead.name}`,
      companyId: company.id,
      contactId: contact?.id,
      leadId: lead.id,
      terraqoWorkspaceId: workspaceId,
      sellerProfileId: lead.assignedProfileId,
      source: lead.source,
      interest: lead.interest,
      estimatedValue: lead.estimatedValue,
      nextFollowUpAt: lead.nextFollowUpAt,
      notes: lead.message
    }
  });
  await prisma.lead.update({ where: { id }, data: { status: "QUALIFIED" } });
  await createActivityLog({
    action: "CONVERTED",
    entityType: "Opportunity",
    entityId: opportunity.id,
    title: `Lead convertido en oportunidad ${opportunity.code}`,
    leadId: lead.id,
    opportunityId: opportunity.id,
    companyId: company.id,
    contactId: contact?.id
    ,terraqoWorkspaceId: lead.terraqoWorkspaceId
  });
  await prisma.notification.create({
    data: {
      type: "LEAD",
      title: "Lead convertido en oportunidad",
      body: `${lead.name} - ${opportunity.title}`,
      href: "/admin/oportunidades",
      terraqoWorkspaceId: workspaceId
    }
  });
  revalidatePath("/admin/leads");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/clientes");
  revalidatePath("/admin/notificaciones");
}

export async function convertOpportunityToQuoteAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireWorkspaceModule("CRM", workspaceId);
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, terraqoWorkspaceId: workspaceId },
    include: { company: true, contact: true, lead: true, quotes: true }
  });
  if (!opportunity) throw new Error("Oportunidad no encontrada.");
  const now = new Date();
  const number = `COT-${now.getFullYear()}-${String(now.getTime()).slice(-7)}`;
  const unitPrice = numberValue(formData, "unitPrice", Number(opportunity.estimatedValue || 0));
  const quantity = Math.max(numberValue(formData, "quantity", 1), 1);
  const subtotal = unitPrice * quantity;
  const existingClient = opportunity.contact?.email
    ? await prisma.client.findFirst({ where: { email: opportunity.contact.email, terraqoWorkspaceId: workspaceId, deletedAt: null } })
    : null;
  const client = opportunity.contact?.email
    ? existingClient
      ? await prisma.client.update({
        where: { id: existingClient.id },
        data: {
          name: opportunity.contact.name,
          company: opportunity.company.tradeName || opportunity.company.legalName,
          phone: opportunity.contact.phone,
          companyId: opportunity.companyId,
          terraqoWorkspaceId: workspaceId
        }
      })
      : await prisma.client.create({
        data: {
          name: opportunity.contact.name,
          email: opportunity.contact.email,
          company: opportunity.company.tradeName || opportunity.company.legalName,
          phone: opportunity.contact.phone,
          contactName: opportunity.contact.name,
          companyId: opportunity.companyId,
          terraqoWorkspaceId: workspaceId
        }
      })
    : null;

  const quote = await prisma.quote.create({
    data: {
      number,
      clientId: client?.id,
      companyId: opportunity.companyId,
      contactId: opportunity.contactId,
      opportunityId: opportunity.id,
      leadId: opportunity.leadId,
      terraqoWorkspaceId: opportunity.terraqoWorkspaceId,
      sellerProfileId: opportunity.sellerProfileId,
      customerName: opportunity.contact?.name || opportunity.company.tradeName || opportunity.company.legalName,
      customerEmail: opportunity.contact?.email,
      company: opportunity.company.tradeName || opportunity.company.legalName,
      subtotal,
      total: subtotal,
      observations: value(formData, "observations") || opportunity.notes,
      items: {
        create: {
          type: value(formData, "itemType") || "service",
          description: value(formData, "description") || opportunity.title,
          quantity,
          unitPrice,
          subtotal
        }
      }
    }
  });
  await prisma.opportunity.update({ where: { id }, data: { status: "PROPOSAL" } });
  await createActivityLog({
    action: "CONVERTED",
    entityType: "Quote",
    entityId: quote.id,
    title: `Oportunidad convertida en cotizacion ${quote.number}`,
    leadId: opportunity.leadId,
    opportunityId: opportunity.id,
    quoteId: quote.id,
    companyId: opportunity.companyId,
    contactId: opportunity.contactId
    ,terraqoWorkspaceId: opportunity.terraqoWorkspaceId
  });
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/cotizaciones");
}

export async function updateOrderStatusAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Pedido", prisma.order.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const status = value(formData, "status") as "PENDING" | "QUOTED" | "PAID" | "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELLED";
  const notes = value(formData, "notes");
  await prisma.order.update({ where: { id }, data: { status, notes } });
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin");
}

export async function deleteOrderAction(id: string) {
  const { workspaceId } = await requireActionRole(["ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Pedido", prisma.order.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.order.delete({ where: { id } });
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin");
}

export async function createQuoteAction(formData: FormData) {
  const { workspaceId: terraqoWorkspaceId } = await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireWorkspaceModule("CRM", terraqoWorkspaceId);
  const client = await upsertClientFromContact(formData);
  const { company, contact } = await upsertCompanyAndContactFromForm(formData);
  const quantity = Math.max(numberValue(formData, "quantity", 1), 1);
  const unitPrice = numberValue(formData, "unitPrice");
  const discount = numberValue(formData, "discount");
  const subtotal = Math.max(quantity * unitPrice - discount, 0);
  const tax = numberValue(formData, "tax");
  const total = subtotal + tax;
  const now = new Date();
  const number = `COT-${now.getFullYear()}-${String(now.getTime()).slice(-7)}`;
  const opportunityId = nullableValue(formData, "opportunityId");
  const leadId = nullableValue(formData, "leadId");
  const sellerProfileId = nullableValue(formData, "sellerProfileId");
  const productId = nullableValue(formData, "productId");
  await Promise.all([
    opportunityId ? requireOwnedEntity("Oportunidad", prisma.opportunity.findFirst({ where: { id: opportunityId, terraqoWorkspaceId }, select: { id: true } })) : null,
    leadId ? requireOwnedEntity("Lead", prisma.lead.findFirst({ where: { id: leadId, terraqoWorkspaceId }, select: { id: true } })) : null,
    sellerProfileId ? requireOwnedEntity("Perfil", prisma.staffProfile.findFirst({ where: { id: sellerProfileId, terraqoWorkspaceId }, select: { id: true } })) : null,
    productId ? requireOwnedEntity("Producto", prisma.product.findFirst({ where: { id: productId, terraqoWorkspaceId }, select: { id: true } })) : null
  ]);

  const quote = await prisma.quote.create({
    data: {
      number,
      clientId: client?.id,
      companyId: company?.id || client?.companyId,
      contactId: contact?.id,
      opportunityId,
      leadId,
      terraqoWorkspaceId,
      sellerProfileId,
      customerName: value(formData, "customerName") || client?.name || "",
      customerEmail: value(formData, "customerEmail") || client?.email,
      company: value(formData, "company") || client?.company,
      status: "DRAFT",
      currency: value(formData, "currency") || "USD",
      subtotal,
      discount,
      tax,
      total,
      validUntil: dateValue(formData, "validUntil"),
      terms: value(formData, "terms"),
      deliveryTime: value(formData, "deliveryTime"),
      observations: value(formData, "observations"),
      items: {
        create: {
          productId,
          type: value(formData, "itemType") || "product",
          description: value(formData, "description") || "Item comercial",
          quantity,
          unitPrice,
          discount,
          subtotal
        }
      }
    }
  });
  await createActivityLog({
    action: "CREATED",
    entityType: "Quote",
    entityId: quote.id,
    title: `Cotizacion ${number} creada`,
    body: value(formData, "description"),
    companyId: company?.id || client?.companyId,
    contactId: contact?.id,
    leadId,
    opportunityId
    ,terraqoWorkspaceId
  });
  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin");
}

export async function updateQuoteStatusAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Cotizacion", prisma.quote.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const status = value(formData, "status") as "DRAFT" | "SENT" | "VIEWED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED";
  const quote = await prisma.quote.update({
    where: { id },
    data: {
      status,
      viewedAt: status === "VIEWED" ? new Date() : undefined,
      acceptedAt: status === "ACCEPTED" ? new Date() : undefined,
      rejectedAt: status === "REJECTED" ? new Date() : undefined
    },
    include: { sellerProfile: true, commissions: true, sale: true, client: true }
  });

  if (status === "ACCEPTED" && quote.sellerProfileId && !quote.commissions.length) {
    const rate = Number(quote.sellerProfile?.commissionRate || 0);
    const amount = Number(quote.total) * (rate / 100);
    await prisma.commission.create({
      data: {
        quoteId: quote.id,
        sellerProfileId: quote.sellerProfileId,
        type: quote.sellerProfile?.commissionType || "SALE_PERCENTAGE",
        baseAmount: quote.total,
        rate,
        amount,
        terraqoWorkspaceId: workspaceId
      }
    });
  }

  if (status === "ACCEPTED" && !quote.sale) {
    const sale = await prisma.sale.create({
      data: {
        number: saleNumber(),
        quoteId: quote.id,
        opportunityId: quote.opportunityId,
        clientId: quote.clientId,
        companyId: quote.companyId || quote.client?.companyId,
        contactId: quote.contactId,
        sellerProfileId: quote.sellerProfileId,
        terraqoWorkspaceId: quote.terraqoWorkspaceId,
        status: "CONFIRMED",
        currency: quote.currency,
        amount: quote.total,
        commissionAmount: quote.sellerProfile ? Number(quote.total) * (Number(quote.sellerProfile.commissionRate || 0) / 100) : 0
      }
    });
    await createActivityLog({
      action: "CONVERTED",
      entityType: "Sale",
      entityId: sale.id,
      title: `Venta ${sale.number} creada desde cotizacion`,
      quoteId: quote.id,
      saleId: sale.id,
      companyId: sale.companyId,
      contactId: sale.contactId,
      opportunityId: sale.opportunityId
      ,terraqoWorkspaceId: quote.terraqoWorkspaceId
    });
  }

  await createActivityLog({
    action: "STATUS_CHANGED",
    entityType: "Quote",
    entityId: quote.id,
    title: `Cotizacion ${quote.number} cambio a ${status}`,
    quoteId: quote.id,
    companyId: quote.companyId,
    contactId: quote.contactId,
    opportunityId: quote.opportunityId
    ,terraqoWorkspaceId: quote.terraqoWorkspaceId
  });

  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/clientes");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin");
  if (quote.publicToken) revalidatePath(`/cotizaciones/${quote.publicToken}`);
}

export async function updateCommissionStatusAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["ADMIN", "SUPER_ADMIN"]);
  await requireOwnedEntity("Comision", prisma.commission.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const status = value(formData, "status") as "PENDING" | "APPROVED" | "PAID" | "CANCELLED";
  await prisma.commission.update({
    where: { id },
    data: {
      status,
      paidAt: status === "PAID" ? new Date() : null,
      notes: value(formData, "notes")
    }
  });
  revalidatePath("/admin/ventas");
}

export async function createFaqAction(formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await prisma.faq.create({
    data: {
      terraqoWorkspaceId: workspaceId,
      question: value(formData, "question") || "",
      answer: value(formData, "answer") || "",
      category: value(formData, "category"),
      position: Number(value(formData, "position") || 0),
      active: checked(formData, "active")
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/faq");
}

export async function updateFaqAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("FAQ", prisma.faq.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.faq.update({
    where: { id },
    data: {
      question: value(formData, "question") || "",
      answer: value(formData, "answer") || "",
      category: value(formData, "category"),
      position: Number(value(formData, "position") || 0),
      active: checked(formData, "active")
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/faq");
}

export async function deleteFaqAction(id: string) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("FAQ", prisma.faq.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.faq.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/faq");
}

export async function createPostAction(formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  const title = value(formData, "title") || "";
  const slug = value(formData, "slug") || slugify(title);
  await prisma.blogPost.create({
    data: {
      title,
      slug,
      excerpt: value(formData, "excerpt") || "",
      content: contentFromText(formData) as Prisma.InputJsonValue,
      author: value(formData, "author"),
      category: value(formData, "category"),
      metaTitle: value(formData, "metaTitle"),
      metaDesc: value(formData, "metaDesc"),
      publishedAt: checked(formData, "isPublished") ? new Date() : null,
      terraqoWorkspaceId: workspaceId
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  redirect(`/admin/contenidos?section=blog&blogStatus=created&item=${encodeURIComponent(title)}`);
}

export async function updatePostAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  const title = value(formData, "title") || "";
  const slug = value(formData, "slug") || slugify(title);
  const previousPost = await prisma.blogPost.findFirst({
    where: { id, terraqoWorkspaceId: workspaceId },
    select: { slug: true }
  });
  if (!previousPost) throw new Error("Post no pertenece al workspace activo.");
  await prisma.blogPost.update({
    where: { id },
    data: {
      title,
      slug,
      excerpt: value(formData, "excerpt") || "",
      content: contentFromText(formData) as Prisma.InputJsonValue,
      author: value(formData, "author"),
      category: value(formData, "category"),
      metaTitle: value(formData, "metaTitle"),
      metaDesc: value(formData, "metaDesc"),
      publishedAt: checked(formData, "isPublished") ? new Date() : null
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  if (previousPost?.slug && previousPost.slug !== slug) {
    revalidatePath(`/blog/${previousPost.slug}`);
  }
  redirect(`/admin/contenidos?section=blog&blogStatus=updated&item=${encodeURIComponent(title)}`);
}

export async function deletePostAction(id: string) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  const post = await prisma.blogPost.findFirst({
    where: { id, terraqoWorkspaceId: workspaceId },
    select: { title: true, slug: true }
  });
  if (!post) throw new Error("Post no pertenece al workspace activo.");
  await prisma.blogPost.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/blog");
  if (post?.slug) {
    revalidatePath(`/blog/${post.slug}`);
  }
  redirect(`/admin/contenidos?section=blog&blogStatus=deleted&item=${encodeURIComponent(post?.title || "Post eliminado")}`);
}

export async function createServiceAction(formData: FormData) {
  const { workspaceId: terraqoWorkspaceId } = await requireActionRole(contentAdminRoles);
  await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);
  const title = value(formData, "title") || "";
  const slug = value(formData, "slug") || slugify(title);
  await prisma.service.create({
    data: { ...serviceFieldsFromForm(formData, title), terraqoWorkspaceId }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/servicios");
  revalidatePath(`/servicios/${slug}`);
}

export async function updateServiceAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  const title = value(formData, "title") || "";
  const previousService = await prisma.service.findFirst({
    where: { id, terraqoWorkspaceId: workspaceId },
    select: { slug: true }
  });
  if (!previousService) throw new Error("Servicio no pertenece al workspace activo.");
  const slug = value(formData, "slug") || slugify(title);
  await prisma.service.update({
    where: { id },
    data: serviceFieldsFromForm(formData, title)
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/servicios");
  revalidatePath(`/servicios/${slug}`);
  if (previousService?.slug && previousService.slug !== slug) {
    revalidatePath(`/servicios/${previousService.slug}`);
  }
}

export async function deleteServiceAction(id: string) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Servicio", prisma.service.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.service.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/servicios");
}

export async function createServiceCategoryAction(formData: FormData) {
  const { workspaceId: terraqoWorkspaceId } = await requireActionRole(contentAdminRoles);
  await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);
  await prisma.serviceCategory.create({
    data: { ...serviceCategoryFieldsFromForm(formData), terraqoWorkspaceId }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/servicios");
}

export async function updateServiceCategoryAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Categoria de servicio", prisma.serviceCategory.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.serviceCategory.update({
    where: { id },
    data: serviceCategoryFieldsFromForm(formData)
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/servicios");
}

export async function deleteServiceCategoryAction(id: string) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Categoria de servicio", prisma.serviceCategory.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.serviceCategory.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/servicios");
}

export async function createSectorAction(formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  const sector = await prisma.sector.create({ data: { ...sectorFieldsFromForm(formData), terraqoWorkspaceId: workspaceId } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/sectores");
  redirect(`/admin/contenidos?section=sectors&contentStatus=created&item=${encodeURIComponent(`Sector creado: ${sector.name}`)}`);
}

export async function updateSectorAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Sector", prisma.sector.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const sector = await prisma.sector.update({ where: { id }, data: sectorFieldsFromForm(formData) });
  revalidatePath("/admin/contenidos");
  revalidatePath("/sectores");
  redirect(`/admin/contenidos?section=sectors&contentStatus=updated&item=${encodeURIComponent(`Sector actualizado: ${sector.name}`)}`);
}

export async function deleteSectorAction(id: string) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Sector", prisma.sector.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const sector = await prisma.sector.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/sectores");
  redirect(`/admin/contenidos?section=sectors&contentStatus=deleted&item=${encodeURIComponent(`Sector eliminado: ${sector.name}`)}`);
}

const baseServiceCatalog = [
  {
    name: "Geomática y Levantamientos de Precisión",
    slug: "geomatica-levantamientos-precision",
    description: "El nucleo tecnico de ICC: medicion de alta precision para obras, catastro, mineria e infraestructura.",
    services: [
      ["Topografía Convencional y Automatizada", "Levantamientos para obras civiles, mineria y catastro con estacion total robotizada."],
      ["Geodesia Satelital (GNSS/RTK)", "Puntos de control, redes geodesicas de alta precision y posicionamiento NTRIP."],
      ["Escaneo Láser 3D (LiDAR Terrestre)", "Captura de realidad de alta densidad para gemelos digitales, plantas industriales y patrimonio historico."],
      ["Batimetría", "Levantamientos de rios, reservorios y lagunas para proyectos hidraulicos y mineros."],
      ["Control Geométrico de Obras", "Replanteo estructural, control de ejes, niveles y alineamientos durante la ejecucion."]
    ]
  },
  {
    name: "Soluciones Aéreas y Digitales",
    slug: "soluciones-aereas-digitales",
    description: "Captura aerea, modelos digitales, GIS y entregables en nube para decisiones modernas.",
    services: [
      ["Fotogrametría con Drones (UAV)", "Ortomosaicos, nubes de puntos densas, MDE y cubicacion volumetrica de stockpiles."],
      ["Modelado 3D y Metodología BIM", "Transformacion de datos de campo en modelos digitales para arquitectura, ingenieria y operacion."],
      ["Gestión Geoespacial (SIG/GIS)", "Analisis espacial, mapas tematicos e integracion con sistemas municipales y de inversion publica."],
      ["Entrega y Productos Digitales", "Planos digitales certificados, informes descargables, modelos en la nube y monitoreo remoto."]
    ]
  },
  {
    name: "Ingeniería de Terrenos",
    slug: "ingenieria-de-terrenos",
    description: "Lectura tecnica de superficie y subsuelo para proyectos que no pueden fallar.",
    services: [
      ["Mecánica de Suelos y Geotecnia", "Ensayos DPL, SPT, granulometria, capacidad portante y estudios de campo."],
      ["Cubicación y Movimiento de Tierras", "Calculo de volumenes de corte y relleno, balance de tierras con drone y software."],
      ["Monitoreo de Taludes y Subsidencias", "Seguimiento de deformaciones en cortes, terraplenes y edificaciones vecinas."],
      ["Hidrología Básica Aplicada", "Pendientes, cuencas y drenaje para habilitaciones urbanas y proyectos viales."]
    ]
  },
  {
    name: "Catastro y Saneamiento Legal",
    slug: "catastro-saneamiento-legal",
    description: "Predios, linderos, expedientes y soporte tecnico para formalizacion fisico-legal.",
    services: [
      ["Levantamiento Catastral Urbano y Rural", "Predios, manzanas, comunidades campesinas y nativas."],
      ["Saneamiento Físico-Legal de Predios", "Planos para SUNARP, georreferenciacion WGS84/PSAD56 y tramites COFOPRI."],
      ["Independización y Acumulación de Predios", "Subdivision, lotizacion y habilitacion urbana."],
      ["Catastro Municipal", "Actualizacion de bases graficas, numeracion predial y planos de zonificacion."],
      ["Peritaje Topográfico Legal", "Informes para procesos judiciales, arbitrajes y resolucion de linderos."]
    ]
  },
  {
    name: "Infraestructura y Sectores Especializados",
    slug: "infraestructura-sectores-especializados",
    description: "Servicios por vertical para vialidad, mineria, ambiente y sector agrario.",
    children: [
      {
        name: "Vialidad e Infraestructura Civil",
        slug: "vialidad-infraestructura-civil",
        services: [
          ["Levantamientos para carreteras, puentes y túneles", "Topografia para proyectos MTC, gobiernos regionales e infraestructura civil."],
          ["Perfiles longitudinales y secciones transversales", "Informacion de campo para diseno geometrico y control vial."],
          ["Topografía para redes de agua, desagüe y energía", "Levantamientos y replanteos para infraestructura sanitaria y electrica."]
        ]
      },
      {
        name: "Minería",
        slug: "mineria",
        services: [
          ["Levantamiento y marcación de concesiones mineras", "Delimitacion y control georreferenciado de concesiones."],
          ["Cubicación de tajos abiertos y labores subterráneas", "Volumenes, control de avance y soporte topografico minero."],
          ["Control de voladuras y movimiento de material", "Marcacion, seguimiento y evidencia para operacion minera."],
          ["Monitoreo geodésico de presas de relaves", "Control de deformaciones y puntos de monitoreo de alta precision."]
        ]
      },
      {
        name: "Medio Ambiente y Sector Agrario",
        slug: "medio-ambiente-sector-agrario",
        services: [
          ["Topografía para proyectos de irrigación y canales", "Pendientes, trazos y control para infraestructura hidraulica."],
          ["Delimitación de áreas de conservación y reservas", "Georreferenciacion de poligonos ambientales y areas protegidas."],
          ["Levantamientos para REDD+ y certificación forestal", "Soporte topografico para inventarios, certificacion y conservacion."],
          ["Topografía para infraestructura agroindustrial", "Levantamientos para plantas, fundos, caminos internos y drenaje."]
        ]
      }
    ]
  },
  {
    name: "Consultoría, Peritaje y Capacitación",
    slug: "consultoria-peritaje-capacitacion",
    description: "Auditoria, validacion, peritaje y gestion geomatica de mayor valor consultivo.",
    services: [
      ["Consultoría en Precisión Geométrica", "Auditorias de control de calidad topografica para constructoras y desarrolladores."],
      ["Peritaje Topográfico", "Informes tecnicos para procesos judiciales, arbitrajes y organismos del Estado."],
      ["Revisión y Validación de Estudios", "Segunda opinion tecnica sobre levantamientos, catastros y planos de terceros."],
      ["Capacitación Técnica", "Formacion para constructoras y municipalidades en instrumentos, software y normativa."],
      ["Gestión de Proyectos Geomáticos", "Coordinacion integral de estudios topograficos en proyectos EPC y PPP."]
    ]
  }
];

export async function seedServiceCatalogAction() {
  const { workspaceId: terraqoWorkspaceId } = await requireActionRole(contentAdminRoles);
  await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);
  const seededServiceSlugs: string[] = [];

  for (const [categoryIndex, category] of baseServiceCatalog.entries()) {
    const parent = await prisma.serviceCategory.upsert({
      where: { terraqoWorkspaceId_slug: { terraqoWorkspaceId, slug: category.slug } },
      update: {
        name: category.name,
        description: category.description,
        seoTitle: category.name,
        metaDescription: category.description,
        position: categoryIndex + 1,
        terraqoWorkspaceId,
        active: true
      },
      create: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        seoTitle: category.name,
        metaDescription: category.description,
        position: categoryIndex + 1,
        terraqoWorkspaceId,
        active: true
      }
    });

    const serviceGroups = [
      { categoryId: parent.id, subcategoryId: undefined, categoryName: category.name, services: category.services || [] },
      ...((category.children || []).map((child, childIndex) => ({ categoryId: parent.id, child, childIndex, services: child.services })))
    ];

    for (const group of serviceGroups) {
      let subcategoryId: string | undefined;
      let categoryName = "categoryName" in group ? group.categoryName : category.name;
      if ("child" in group && group.child) {
        const child = await prisma.serviceCategory.upsert({
          where: { terraqoWorkspaceId_slug: { terraqoWorkspaceId, slug: group.child.slug } },
          update: {
            name: group.child.name,
            parentId: parent.id,
            position: (group.childIndex || 0) + 1,
            terraqoWorkspaceId,
            active: true
          },
          create: {
            name: group.child.name,
            slug: group.child.slug,
            parentId: parent.id,
            position: (group.childIndex || 0) + 1,
            terraqoWorkspaceId,
            active: true
          }
        });
        subcategoryId = child.id;
        categoryName = child.name;
      }

      for (const [title, summary] of group.services) {
        const serviceSlug = slugify(title);
        seededServiceSlugs.push(serviceSlug);
        await prisma.service.upsert({
          where: { terraqoWorkspaceId_slug: { terraqoWorkspaceId, slug: serviceSlug } },
          update: {
            title,
            category: categoryName,
            categoryId: parent.id,
            subcategoryId,
            headline: summary,
            summary,
            seoTitle: `${title} en Peru`,
            metaDescription: summary,
            terraqoWorkspaceId,
            isPublished: true
          },
          create: {
            title,
            slug: serviceSlug,
            category: categoryName,
            categoryId: parent.id,
            subcategoryId,
            status: "ACTIVE",
            headline: summary,
            summary,
            benefits: ["Precision tecnica trazable", "Entregables listos para decision", "Soporte especializado ICC"],
            applications: [categoryName],
            deliverables: ["Informe tecnico", "Archivos digitales", "Evidencia de campo"],
            technologies: ["GNSS", "Estacion total", "CAD/GIS"],
            formats: ["PDF", "DWG", "KMZ", "XLSX"],
            compatibility: ["Civil 3D", "AutoCAD", "GIS", "BIM segun alcance"],
            seoTitle: `${title} en Peru`,
            metaDescription: summary,
            terraqoWorkspaceId,
            content: { problem: summary },
            isPublished: true
          }
        });
      }
    }
  }

  await prisma.service.deleteMany({
    where: {
      slug: { notIn: seededServiceSlugs }
      ,terraqoWorkspaceId
    }
  });

  revalidatePath("/admin/contenidos");
  revalidatePath("/servicios");
}

export async function createTestimonialAction(formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await prisma.testimonial.create({
    data: {
      terraqoWorkspaceId: workspaceId,
      quote: value(formData, "quote") || "",
      author: value(formData, "author") || "",
      company: value(formData, "company"),
      role: value(formData, "role"),
      active: checked(formData, "active")
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function updateTestimonialAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Testimonio", prisma.testimonial.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.testimonial.update({
    where: { id },
    data: {
      quote: value(formData, "quote") || "",
      author: value(formData, "author") || "",
      company: value(formData, "company"),
      role: value(formData, "role"),
      active: checked(formData, "active")
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function deleteTestimonialAction(id: string) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Testimonio", prisma.testimonial.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.testimonial.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function createClientLogoAction(formData: FormData) {
  const { workspaceId: terraqoWorkspaceId } = await requireActionRole(contentAdminRoles);
  await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);
  const name = value(formData, "name") || "";
  const logoUrl = value(formData, "logoUrl");
  if (!name || !logoUrl) return;

  await prisma.clientLogo.create({
    data: {
      name,
      logoUrl,
      website: value(formData, "website"),
      sector: value(formData, "sector"),
      position: numberValue(formData, "position"),
      terraqoWorkspaceId,
      active: checked(formData, "active")
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function updateClientLogoAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Logo de cliente", prisma.clientLogo.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const name = value(formData, "name") || "";
  const logoUrl = value(formData, "logoUrl");
  if (!name || !logoUrl) return;

  await prisma.clientLogo.update({
    where: { id },
    data: {
      name,
      logoUrl,
      website: value(formData, "website"),
      sector: value(formData, "sector"),
      position: numberValue(formData, "position"),
      active: checked(formData, "active"),
      terraqoWorkspaceId: workspaceId
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function deleteClientLogoAction(id: string) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Logo de cliente", prisma.clientLogo.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.clientLogo.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function createBannerAction(formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await prisma.banner.create({
    data: {
      title: value(formData, "title") || "",
      subtitle: value(formData, "subtitle"),
      ctaLabel: value(formData, "ctaLabel"),
      ctaHref: value(formData, "ctaHref"),
      image: value(formData, "image"),
      placement: value(formData, "placement") || "home",
      active: checked(formData, "active"),
      terraqoWorkspaceId: workspaceId
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function updateBannerAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Banner", prisma.banner.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.banner.update({
    where: { id },
    data: {
      title: value(formData, "title") || "",
      subtitle: value(formData, "subtitle"),
      ctaLabel: value(formData, "ctaLabel"),
      ctaHref: value(formData, "ctaHref"),
      image: value(formData, "image"),
      placement: value(formData, "placement") || "home",
      active: checked(formData, "active")
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function deleteBannerAction(id: string) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Banner", prisma.banner.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.banner.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function createCmsPageAction(formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  const title = value(formData, "title") || "";
  await prisma.cmsPage.create({
    data: {
      title,
      slug: value(formData, "slug") || slugify(title),
      metaTitle: value(formData, "metaTitle"),
      metaDesc: value(formData, "metaDesc"),
      content: contentFromText(formData) as Prisma.InputJsonValue,
      isPublished: checked(formData, "isPublished"),
      terraqoWorkspaceId: workspaceId
    }
  });
  revalidatePath("/admin/contenidos");
}

export async function updateCmsPageAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Pagina CMS", prisma.cmsPage.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const title = value(formData, "title") || "";
  await prisma.cmsPage.update({
    where: { id },
    data: {
      title,
      slug: value(formData, "slug") || slugify(title),
      metaTitle: value(formData, "metaTitle"),
      metaDesc: value(formData, "metaDesc"),
      content: contentFromText(formData) as Prisma.InputJsonValue,
      isPublished: checked(formData, "isPublished")
    }
  });
  revalidatePath("/admin/contenidos");
}

export async function deleteCmsPageAction(id: string) {
  const { workspaceId } = await requireActionRole(contentAdminRoles);
  await requireOwnedEntity("Pagina CMS", prisma.cmsPage.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.cmsPage.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
}

export async function takeChatConversationAction(id: string) {
  const { session, workspaceId } = await requireActionRole(["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Conversacion", prisma.chatConversation.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const [profile, userId] = await Promise.all([
    session?.user?.id ? prisma.staffProfile.findFirst({ where: { userId: session.user.id, terraqoWorkspaceId: workspaceId } }) : null,
    existingUserId(session.user.id)
  ]);

  await prisma.chatConversation.update({
    where: { id },
    data: {
      assignedToId: userId,
      assignedProfileId: profile?.id || undefined
    }
  });
  revalidatePath("/admin/chat");
}

export async function assignChatProfileAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Conversacion", prisma.chatConversation.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const profileId = value(formData, "profileId");
  if (profileId) {
    await requireOwnedEntity("Perfil", prisma.staffProfile.findFirst({ where: { id: profileId, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  }

  await prisma.chatConversation.update({
    where: { id },
    data: {
      assignedProfileId: profileId || null,
      assignedToId: undefined
    }
  });
  revalidatePath("/admin/chat");
}

export async function closeChatConversationAction(id: string) {
  const { session, role, workspaceId } = await requireActionRole(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"]);
  await requireOwnedEntity("Conversacion", prisma.chatConversation.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  if (!["ADMIN", "EDITOR", "SUPER_ADMIN", "COMMERCIAL_ADMIN"].includes(role)) {
    const profile = await prisma.staffProfile.findFirst({ where: { userId: session.user.id, terraqoWorkspaceId: workspaceId } });
    const conversation = await prisma.chatConversation.findUnique({
      where: { id },
      select: { assignedProfileId: true, assignedToId: true }
    });
    const canClose = conversation?.assignedToId === session.user.id || (profile?.id && conversation?.assignedProfileId === profile.id);
    if (!canClose) throw new Error("Este chat no esta asignado a tu perfil.");
  }
  await prisma.chatConversation.update({
    where: { id },
    data: { status: "CLOSED" }
  });
  revalidatePath("/admin/chat");
}

export async function deleteChatConversationAction(id: string) {
  const { workspaceId } = await requireActionRole(["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Conversacion", prisma.chatConversation.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.chatConversation.delete({ where: { id } });
  revalidatePath("/admin/chat");
  revalidatePath("/admin");
}

export async function sendAdminChatMessageAction(id: string, formData: FormData) {
  const body = value(formData, "body");
  if (!body) return;
  const { session, role, workspaceId } = await requireActionRole(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"]);
  const [profile, userId] = await Promise.all([
    prisma.staffProfile.findFirst({ where: { userId: session.user.id, terraqoWorkspaceId: workspaceId } }),
    existingUserId(session.user.id)
  ]);
  const conversation = await prisma.chatConversation.findFirst({
    where: { id, terraqoWorkspaceId: workspaceId },
    select: { assignedProfileId: true, assignedToId: true }
  });
  if (!conversation) throw new Error("Conversacion no pertenece al workspace activo.");
  const canManageAnyChat = ["ADMIN", "EDITOR", "SUPER_ADMIN", "COMMERCIAL_ADMIN"].includes(role);
  const canReply =
    canManageAnyChat ||
    conversation?.assignedToId === session.user.id ||
    (profile?.id && conversation?.assignedProfileId === profile.id);

  if (!canReply) throw new Error("Este chat no esta asignado a tu perfil.");

  await prisma.chatConversation.update({
    where: { id },
    data: {
      status: "ACTIVE",
      assignedToId: userId || conversation?.assignedToId || null,
      assignedProfileId: conversation?.assignedProfileId || profile?.id || undefined,
      messages: {
        create: {
          sender: "admin",
          body
        }
      }
    }
  });
  revalidatePath("/admin/chat");
}

export async function createStaffProfileAction(formData: FormData) {
  const { workspaceId } = await requireActionRole(["ADMIN"]);
  await prisma.staffProfile.create({
    data: {
      displayName: value(formData, "displayName") || "",
      email: value(formData, "email"),
      phone: value(formData, "phone"),
      roleTitle: value(formData, "roleTitle") || "",
      department: (value(formData, "department") as StaffDepartment | undefined) || "SALES",
      ...staffCommercialFieldsFromForm(formData),
      specialties: listFromTextarea(formData, "specialties"),
      tools: staffToolsFromForm(formData) as Prisma.InputJsonValue,
      active: checked(formData, "active"),
      terraqoWorkspaceId: workspaceId
    }
  });
  revalidatePath("/admin/equipo");
  revalidatePath("/admin/chat");
}

export async function updateStaffProfileAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["ADMIN"]);
  await requireOwnedEntity("Perfil", prisma.staffProfile.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.staffProfile.update({
    where: { id },
    data: {
      displayName: value(formData, "displayName") || "",
      email: value(formData, "email"),
      phone: value(formData, "phone"),
      roleTitle: value(formData, "roleTitle") || "",
      department: (value(formData, "department") as StaffDepartment | undefined) || "SALES",
      ...staffCommercialFieldsFromForm(formData),
      specialties: listFromTextarea(formData, "specialties"),
      tools: staffToolsFromForm(formData) as Prisma.InputJsonValue,
      active: checked(formData, "active")
    }
  });
  revalidatePath("/admin/equipo");
  revalidatePath("/admin/chat");
}

export async function updateSellerCommercialAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["ADMIN", "SUPER_ADMIN"]);
  await requireOwnedEntity("Perfil", prisma.staffProfile.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.staffProfile.update({
    where: { id },
    data: staffCommercialFieldsFromForm(formData)
  });
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/equipo");
}

const createProjectClientValue = "__new_client__";

function generatedClientEmail(name: string, terraqoWorkspaceId: string) {
  const base = slugify(name).slice(0, 48) || "cliente";
  return `cliente+${base}-${terraqoWorkspaceId.slice(-8)}@terraqo.local`;
}

async function syncProjectClientLogo({
  terraqoWorkspaceId,
  name,
  logoUrl,
  website,
  sector
}: {
  terraqoWorkspaceId: string;
  name: string;
  logoUrl?: string;
  website?: string;
  sector?: string;
}) {
  if (!name || (!logoUrl && !website && !sector)) return;

  const existing = await prisma.clientLogo.findFirst({
    where: { terraqoWorkspaceId, name }
  });

  if (existing) {
    await prisma.clientLogo.update({
      where: { id: existing.id },
      data: {
        logoUrl: logoUrl || existing.logoUrl,
        website: website || existing.website,
        sector: sector || existing.sector,
        active: true
      }
    });
    return;
  }

  if (!logoUrl) return;

  const lastLogo = await prisma.clientLogo.findFirst({
    where: { terraqoWorkspaceId },
    orderBy: { position: "desc" },
    select: { position: true }
  });

  await prisma.clientLogo.create({
    data: {
      name,
      logoUrl,
      website,
      sector,
      active: true,
      position: (lastLogo?.position || 0) + 1,
      terraqoWorkspaceId
    }
  });
}

async function resolveProjectClient(formData: FormData, terraqoWorkspaceId: string) {
  const rawClientId = value(formData, "clientId");

  if (rawClientId && rawClientId !== createProjectClientValue) {
    const client = await prisma.client.findFirst({
      where: { id: rawClientId, terraqoWorkspaceId, deletedAt: null }
    });
    if (!client) throw new Error("Cliente no pertenece al workspace activo.");

    return {
      clientId: client.id,
      companyId: client.companyId,
      clientName: client.company || client.name
    };
  }

  const newClientName = value(formData, "newClientName");
  if (rawClientId === createProjectClientValue || newClientName) {
    const clientName = newClientName || value(formData, "clientName") || "Cliente sin nombre";
    const clientEmail = value(formData, "newClientEmail") || generatedClientEmail(clientName, terraqoWorkspaceId);
    const existingClient = await prisma.client.findFirst({
      where: {
        terraqoWorkspaceId,
        deletedAt: null,
        OR: [
          { email: clientEmail },
          { name: clientName },
          { company: clientName }
        ]
      }
    });

    const client = existingClient
      ? await prisma.client.update({
          where: { id: existingClient.id },
          data: {
            name: existingClient.name || clientName,
            company: existingClient.company || clientName,
            email: existingClient.email || clientEmail,
            status: existingClient.status || "activo"
          }
        })
      : await prisma.client.create({
          data: {
            name: clientName,
            company: clientName,
            email: clientEmail,
            status: "activo",
            terraqoWorkspaceId
          }
        });

    await syncProjectClientLogo({
      terraqoWorkspaceId,
      name: clientName,
      logoUrl: value(formData, "newClientLogoUrl"),
      website: value(formData, "newClientWebsite"),
      sector: value(formData, "newClientSector")
    });

    return {
      clientId: client.id,
      companyId: client.companyId,
      clientName: client.company || client.name
    };
  }

  return {
    clientId: null,
    companyId: null,
    clientName: value(formData, "clientName") || null
  };
}

export async function createProjectAction(formData: FormData) {
  const { workspaceId: terraqoWorkspaceId } = await requireActionRole(projectAdminRoles);
  await requireWorkspaceModule("PROJECTS", terraqoWorkspaceId);
  const title = value(formData, "title") || "";
  const opportunityId = nullableValue(formData, "opportunityId");
  const saleId = nullableValue(formData, "saleId");
  try {
    const projectClient = await resolveProjectClient(formData, terraqoWorkspaceId);
    const companyId = nullableValue(formData, "companyId") || projectClient.companyId;

    await Promise.all([
      companyId ? requireOwnedEntity("Empresa", prisma.company.findFirst({ where: { id: companyId, terraqoWorkspaceId }, select: { id: true } })) : null,
      opportunityId ? requireOwnedEntity("Oportunidad", prisma.opportunity.findFirst({ where: { id: opportunityId, terraqoWorkspaceId }, select: { id: true } })) : null,
      saleId ? requireOwnedEntity("Venta", prisma.sale.findFirst({ where: { id: saleId, terraqoWorkspaceId }, select: { id: true } })) : null
    ]);

    await prisma.project.create({
      data: {
        title,
        slug: value(formData, "slug") || slugify(title),
        clientId: projectClient.clientId,
        companyId,
        opportunityId,
        saleId,
        terraqoWorkspaceId,
        clientName: projectClient.clientName,
        location: value(formData, "location"),
        latitude: nullableNumberValue(formData, "latitude"),
        longitude: nullableNumberValue(formData, "longitude"),
        geofenceRadiusMeters: Math.max(25, Math.round(numberValue(formData, "geofenceRadiusMeters", 250))),
        category: value(formData, "category"),
        servicesApplied: listFromTextarea(formData, "servicesApplied"),
        summary: value(formData, "summary") || "",
        description: value(formData, "description") || "",
        challenge: value(formData, "challenge"),
        solution: value(formData, "solution"),
        results: value(formData, "results"),
        status: (value(formData, "status") as "PLANNING" | "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ARCHIVED") || "PLANNING",
        isPublic: checked(formData, "isPublic"),
        isFeatured: checked(formData, "isFeatured"),
        images: {
          create: listFromTextarea(formData, "images").map((url, position) => ({ url, position, alt: title }))
        }
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      adminErrorRedirect("Ya existe un proyecto con ese slug. Cambia el slug o deja que se genere uno nuevo.");
    }
    adminErrorRedirect("No se pudo crear el proyecto. Revisa los datos e intenta nuevamente.");
  }
  revalidatePath("/admin/proyectos");
  revalidatePath("/");
  revalidatePath("/proyectos");
  revalidatePath("/api/public/icc-topografia/content");
  redirect(`/admin/proyectos?projectStatus=created&item=${encodeURIComponent(title)}`);
}

export async function createProjectFromSaleAction(id: string, formData: FormData) {
  const { workspaceId: fallbackWorkspaceId } = await requireActionRole(["ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "ENGINEER"]);
  await requireWorkspaceModule("PROJECTS", fallbackWorkspaceId);
  const sale = await prisma.sale.findFirst({
    where: { id, terraqoWorkspaceId: fallbackWorkspaceId },
    include: { quote: { include: { items: true } }, company: true, client: true }
  });
  if (!sale) throw new Error("Venta no encontrada.");
  const existing = await prisma.project.findFirst({ where: { saleId: id, terraqoWorkspaceId: fallbackWorkspaceId, deletedAt: null } });
  if (existing) {
    revalidatePath("/admin/proyectos");
    return;
  }
  const title = value(formData, "title") || sale.quote?.items[0]?.description || `Proyecto ${sale.number}`;
  const project = await prisma.project.create({
    data: {
      title,
      slug: value(formData, "slug") || slugify(`${title}-${sale.number}`),
      saleId: sale.id,
      opportunityId: sale.opportunityId,
      clientId: sale.clientId,
      companyId: sale.companyId,
      terraqoWorkspaceId: sale.terraqoWorkspaceId || fallbackWorkspaceId,
      clientName: sale.company?.tradeName || sale.company?.legalName || sale.client?.company || sale.client?.name,
      location: value(formData, "location"),
      category: value(formData, "category") || "Proyecto tecnico",
      servicesApplied: listFromTextarea(formData, "servicesApplied"),
      summary: value(formData, "summary") || `Proyecto creado desde venta ${sale.number}.`,
      description: value(formData, "description") || sale.quote?.observations || `Ejecucion tecnica asociada a ${sale.number}.`,
      status: "PLANNING",
      milestones: {
        create: [
          { title: "Planificacion y alcance", description: "Validar alcance, equipo y cronograma." },
          { title: "Ejecucion tecnica", description: "Trabajo de campo/gabinete segun servicio contratado." },
          { title: "Entregables y cierre", description: "Entrega de informes, planos o evidencias." }
        ]
      }
    }
  });
  await createActivityLog({
    action: "CONVERTED",
    entityType: "Project",
    entityId: project.id,
    title: `Venta ${sale.number} convertida en proyecto`,
    saleId: sale.id,
    projectId: project.id,
    quoteId: sale.quoteId,
    opportunityId: sale.opportunityId,
    companyId: sale.companyId,
    contactId: sale.contactId
    ,terraqoWorkspaceId: sale.terraqoWorkspaceId || fallbackWorkspaceId
  });
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/proyectos");
  revalidatePath("/admin/clientes");
}

export async function updateProjectAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(projectAdminRoles);
  await requireOwnedEntity("Proyecto", prisma.project.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const title = value(formData, "title") || "";
  const images = listFromTextarea(formData, "images");
  try {
    const projectClient = await resolveProjectClient(formData, workspaceId);
    const companyId = nullableValue(formData, "companyId") || projectClient.companyId;

    if (companyId) {
      await requireOwnedEntity("Empresa", prisma.company.findFirst({ where: { id: companyId, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
    }

    await prisma.project.update({
      where: { id },
      data: {
        title,
        slug: value(formData, "slug") || slugify(title),
        clientId: projectClient.clientId,
        companyId,
        clientName: projectClient.clientName,
        location: value(formData, "location"),
        latitude: nullableNumberValue(formData, "latitude"),
        longitude: nullableNumberValue(formData, "longitude"),
        geofenceRadiusMeters: Math.max(25, Math.round(numberValue(formData, "geofenceRadiusMeters", 250))),
        category: value(formData, "category"),
        servicesApplied: listFromTextarea(formData, "servicesApplied"),
        summary: value(formData, "summary") || "",
        description: value(formData, "description") || "",
        challenge: value(formData, "challenge"),
        solution: value(formData, "solution"),
        results: value(formData, "results"),
        status: (value(formData, "status") as "PLANNING" | "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ARCHIVED") || "PLANNING",
        isPublic: checked(formData, "isPublic"),
        isFeatured: checked(formData, "isFeatured"),
        images: {
          deleteMany: {},
          create: images.map((url, position) => ({ url, position, alt: title }))
        }
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      adminErrorRedirect("Ya existe otro proyecto con ese slug. Usa un slug unico antes de guardar.");
    }
    adminErrorRedirect("No se pudo actualizar el proyecto. Revisa los datos e intenta nuevamente.");
  }
  revalidatePath("/admin/proyectos");
  revalidatePath("/");
  revalidatePath("/proyectos");
  revalidatePath("/api/public/icc-topografia/content");
  redirect(`/admin/proyectos?projectStatus=updated&item=${encodeURIComponent(title)}`);
}

export async function deleteProjectAction(id: string) {
  const { workspaceId } = await requireActionRole(projectAdminRoles);
  await requireOwnedEntity("Proyecto", prisma.project.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const project = await prisma.project.delete({ where: { id } });
  revalidatePath("/admin/proyectos");
  revalidatePath("/proyectos");
  redirect(`/admin/proyectos?projectStatus=deleted&item=${encodeURIComponent(project.title)}`);
}

export async function createProjectProgressAction(projectId: string, formData: FormData) {
  const { session, workspaceId } = await requireActionRole(["SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT", "EDITOR", "ADMIN", "SUPER_ADMIN"]);
  await requireOwnedEntity("Proyecto", prisma.project.findFirst({ where: { id: projectId, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const title = value(formData, "title");
  const body = value(formData, "body");
  if (!title || !body) return;
  const profile = await prisma.staffProfile.findFirst({ where: { userId: session.user.id, terraqoWorkspaceId: workspaceId } });

  await prisma.projectProgress.create({
    data: {
      projectId,
      staffProfileId: profile?.id,
      title,
      body,
      milestone: value(formData, "milestone"),
      files: listFromTextarea(formData, "files")
    }
  });
  revalidatePath("/admin/proyectos");
  revalidatePath("/admin/tecnicos");
}

export async function updateTechnicalProfileAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["ADMIN", "SUPER_ADMIN", "ENGINEER"]);
  await requireOwnedEntity("Perfil", prisma.staffProfile.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.staffProfile.update({
    where: { id },
    data: {
      roleTitle: value(formData, "roleTitle") || "",
      phone: value(formData, "phone"),
      department: (value(formData, "department") as StaffDepartment | undefined) || "FIELD_ENGINEERING",
      specialties: listFromTextarea(formData, "specialties"),
      ...staffTechnicalFieldsFromForm(formData),
      active: checked(formData, "active")
    }
  });
  revalidatePath("/admin/tecnicos");
  revalidatePath("/admin/equipo");
}

export async function updateTicketAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["SUPPORT", "TECHNICIAN", "SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Ticket", prisma.ticket.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const assignedProfileId = nullableValue(formData, "assignedProfileId");
  if (assignedProfileId) {
    await requireOwnedEntity("Perfil", prisma.staffProfile.findFirst({ where: { id: assignedProfileId, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  }
  const status = (value(formData, "status") as TicketStatus | undefined) || "OPEN";
  await prisma.ticket.update({
    where: { id },
    data: {
      status,
      priority: (value(formData, "priority") as TicketPriority | undefined) || "MEDIUM",
      category: (value(formData, "category") as TicketCategory | undefined) || "TECHNICAL_QUERY",
      assignedProfileId,
      closedAt: ticketClosedAt(status)
    }
  });
  revalidatePath("/admin/tickets");
  revalidatePath("/portal");
  revalidatePath("/admin");
}

export async function sendTicketMessageAction(id: string, formData: FormData) {
  const body = value(formData, "body");
  if (!body) return;
  const { session, workspaceId } = await requireActionRole(["SUPPORT", "TECHNICIAN", "SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Ticket", prisma.ticket.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));

  await prisma.ticket.update({
    where: { id },
    data: {
      status: "WAITING_CUSTOMER",
      messages: {
        create: {
          authorId: session.user.id,
          sender: "staff",
          body,
          files: listFromTextarea(formData, "files")
        }
      }
    }
  });
  revalidatePath("/admin/tickets");
  revalidatePath("/portal");
}

export async function createInternalChannelAction(formData: FormData) {
  const { workspaceId } = await requireActionRole(["ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const name = value(formData, "name");
  if (!name) return;
  const slug = value(formData, "slug") || slugify(name);
  const channel = await prisma.internalChatChannel.findFirst({ where: { slug, terraqoWorkspaceId: workspaceId } });
  if (channel) {
    await prisma.internalChatChannel.update({
      where: { id: channel.id },
      data: {
      name,
      description: value(formData, "description")
      }
    });
  } else {
    await prisma.internalChatChannel.create({
      data: {
      name,
      slug,
      description: value(formData, "description"),
      terraqoWorkspaceId: workspaceId
      }
    });
  }
  revalidatePath("/admin/chat-interno");
}

export async function sendInternalMessageAction(channelId: string, formData: FormData) {
  const body = value(formData, "body");
  if (!body) return;
  const { session, workspaceId } = await requireActionRole(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);
  const leadId = nullableValue(formData, "leadId");
  const projectId = nullableValue(formData, "projectId");
  const ticketId = nullableValue(formData, "ticketId");
  await requireOwnedEntity("Canal", prisma.internalChatChannel.findFirst({ where: { id: channelId, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await Promise.all([
    leadId ? requireOwnedEntity("Lead", prisma.lead.findFirst({ where: { id: leadId, terraqoWorkspaceId: workspaceId }, select: { id: true } })) : null,
    projectId ? requireOwnedEntity("Proyecto", prisma.project.findFirst({ where: { id: projectId, terraqoWorkspaceId: workspaceId }, select: { id: true } })) : null,
    ticketId ? requireOwnedEntity("Ticket", prisma.ticket.findFirst({ where: { id: ticketId, terraqoWorkspaceId: workspaceId }, select: { id: true } })) : null
  ]);
  await prisma.internalChatMessage.create({
    data: {
      channelId,
      userId: session.user.id,
      body,
      files: listFromTextarea(formData, "files"),
      leadId,
      projectId,
      ticketId
    }
  });
  revalidatePath("/admin/chat-interno");
}

export async function reviewBotQuestionAction(id: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await requireOwnedEntity("Pregunta", prisma.botUnansweredQuestion.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  const status = (value(formData, "status") as BotQuestionStatus | undefined) || "PENDING";
  const question = await prisma.botUnansweredQuestion.update({
    where: { id },
    data: {
      status,
      answer: value(formData, "answer"),
      category: value(formData, "category")
    }
  });

  if (status === "APPROVED" && question.answer) {
    await prisma.faq.create({
      data: {
        question: question.question,
        answer: question.answer,
        category: question.category || "atencion",
        origin: "chatbot",
        approved: true,
        active: true,
        terraqoWorkspaceId: workspaceId
      }
    });
  }

  revalidatePath("/admin/chatbot");
  revalidatePath("/admin/contenidos");
  revalidatePath("/faq");
}

export async function markNotificationReadAction(id: string) {
  const { session, workspaceId } = await requireActionRole(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);
  await prisma.notification.updateMany({
    where: { id, terraqoWorkspaceId: workspaceId, OR: [{ userId: session.user.id }, { userId: null }] },
    data: { readAt: new Date() }
  });
  revalidatePath("/admin/notificaciones");
}

export async function deleteStaffProfileAction(id: string) {
  const { workspaceId } = await requireActionRole(["ADMIN"]);
  await requireOwnedEntity("Perfil", prisma.staffProfile.findFirst({ where: { id, terraqoWorkspaceId: workspaceId }, select: { id: true } }));
  await prisma.staffProfile.delete({ where: { id } });
  revalidatePath("/admin/equipo");
  revalidatePath("/admin/chat");
}

export async function upsertStaffAccessAction(profileId: string, formData: FormData) {
  const { workspaceId } = await requireActionRole(["ADMIN"]);

  const profile = await prisma.staffProfile.findFirst({
    where: { id: profileId, terraqoWorkspaceId: workspaceId },
    include: { user: true }
  });
  if (!profile) throw new Error("Perfil no encontrado.");

  const email = value(formData, "accessEmail") || profile.email;
  const temporaryPassword = value(formData, "temporaryPassword");
  const role = roleFromForm(formData);
  if (!email) throw new Error("El correo de acceso es obligatorio.");

  const data: Prisma.UserUpdateInput = {
    name: profile.displayName,
    email,
    role
  };

  if (temporaryPassword) {
    data.passwordHash = await bcrypt.hash(temporaryPassword, 12);
  }

  let userId = profile.userId;
  if (profile.userId) {
    const memberships = await prisma.terraqoWorkspaceMember.findMany({
      where: { userId: profile.userId, active: true },
      select: { workspaceId: true }
    });
    if (!memberships.some((membership) => membership.workspaceId === workspaceId)) {
      throw new Error("El usuario vinculado no pertenece al workspace activo.");
    }
    if (memberships.some((membership) => membership.workspaceId !== workspaceId)) {
      throw new Error("La identidad pertenece a varios workspaces y solo puede editarla un administrador Terraqo.");
    }
    await prisma.user.update({ where: { id: profile.userId }, data });
  } else {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error("Este correo ya pertenece a una identidad Terraqo. Solicita al administrador Terraqo que la incorpore al workspace.");
    } else {
      if (!temporaryPassword) throw new Error("La contraseña temporal es obligatoria para crear un acceso nuevo.");
      const user = await prisma.user.create({
        data: {
          name: profile.displayName,
          email,
          passwordHash: await bcrypt.hash(temporaryPassword, 12),
          role
        }
      });
      userId = user.id;
    }
  }

  await prisma.staffProfile.update({
    where: { id: profileId },
    data: {
      userId,
      email: profile.email || email
    }
  });
  if (userId) {
    await prisma.terraqoWorkspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      update: { active: true, joinedAt: new Date() },
      create: {
        workspaceId,
        userId,
        role: role === "ADMIN" || role === "SUPER_ADMIN" ? "ADMIN" : "MEMBER",
        title: profile.roleTitle,
        active: true,
        joinedAt: new Date()
      }
    });
  }
  revalidatePath("/admin/equipo");
  revalidatePath("/admin/chat");
}

export async function unlinkStaffAccessAction(profileId: string) {
  const { workspaceId } = await requireActionRole(["ADMIN"]);
  const profile = await prisma.staffProfile.findFirst({ where: { id: profileId, terraqoWorkspaceId: workspaceId }, select: { id: true, userId: true } });
  if (!profile) throw new Error("Perfil no pertenece al workspace activo.");
  await prisma.staffProfile.update({
    where: { id: profileId },
    data: { userId: null }
  });
  if (profile.userId) {
    await prisma.terraqoWorkspaceMember.updateMany({
      where: { workspaceId, userId: profile.userId },
      data: { active: false }
    });
  }
  revalidatePath("/admin/equipo");
  revalidatePath("/admin/chat");
}

export async function approveClientAccountAction(accountId: string) {
  const { workspaceId } = await requireActionRole(["ADMIN", "SUPER_ADMIN"]);
  const ownedAccount = await prisma.clientAccount.findFirst({ where: { id: accountId, terraqoWorkspaceId: workspaceId }, select: { id: true } });
  if (!ownedAccount) throw new Error("Cuenta cliente no pertenece al workspace activo.");
  const account = await prisma.clientAccount.update({
    where: { id: ownedAccount.id },
    data: { status: "active" },
    include: { client: true, company: true }
  });

  await prisma.company.update({
    where: { id: account.companyId },
    data: { status: "cliente activo" }
  });

  if (account.clientId) {
    await prisma.client.update({
      where: { id: account.clientId },
      data: { status: "cliente activo" }
    });
  }

  await prisma.notification.create({
    data: {
      type: "SYSTEM",
      title: "Acceso cliente aprobado",
      body: `${account.client?.name || account.company.legalName} ya puede ingresar al portal.`,
      href: `/admin/clientes${account.clientId ? `/${account.clientId}` : ""}`,
      terraqoWorkspaceId: workspaceId
    }
  });

  revalidatePath("/admin/clientes");
  revalidatePath("/portal");
}

export async function rejectClientAccountAction(accountId: string) {
  const { workspaceId } = await requireActionRole(["ADMIN", "SUPER_ADMIN"]);
  const ownedAccount = await prisma.clientAccount.findFirst({ where: { id: accountId, terraqoWorkspaceId: workspaceId }, select: { id: true } });
  if (!ownedAccount) throw new Error("Cuenta cliente no pertenece al workspace activo.");
  const account = await prisma.clientAccount.update({
    where: { id: ownedAccount.id },
    data: { status: "rejected" },
    include: { client: true, company: true }
  });

  await prisma.company.update({
    where: { id: account.companyId },
    data: { status: "registro rechazado" }
  });

  if (account.clientId) {
    await prisma.client.update({
      where: { id: account.clientId },
      data: { status: "registro rechazado" }
    });
  }

  revalidatePath("/admin/clientes");
  revalidatePath("/portal");
}
