"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ActivityAction, BotQuestionStatus, CommissionType, Prisma, Role, StaffDepartment, TechnicalAvailability, TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/server/api";

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

function adminErrorRedirect(message: string) {
  redirect(`/admin/proyectos?projectStatus=error&item=${encodeURIComponent(message)}`);
}

const projectAdminRoles: Role[] = ["EDITOR", "ADMIN", "SUPER_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT"];

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

  return { session, role };
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
  metadata?: Prisma.InputJsonValue;
}) {
  const session = await auth();
  await prisma.activityLog.create({
    data: {
      actorId: session?.user?.id,
      ...data
    }
  });
}

async function upsertCompanyAndContactFromForm(formData: FormData) {
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
    ? await prisma.company.findUnique({ where: { id: explicitCompanyId } })
    : companyLookup.length
      ? await prisma.company.findFirst({
        where: {
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
          phone: value(formData, "phone") || existing.phone
        }
      })
    : await prisma.company.create({
        data: {
          legalName: companyName || contactName || contactEmail || "Empresa sin nombre",
          tradeName: companyName,
          document,
          email: contactEmail,
          phone: value(formData, "phone")
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
          name: contactName || contactEmail || "Contacto",
          email: contactEmail,
          phone: value(formData, "phone"),
          whatsapp: value(formData, "phone"),
          isPrimary: true
        }
      }).catch(async () => prisma.contact.create({
        data: {
          companyId: company.id,
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
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead no encontrado.");
  if (lead.companyId) {
    const company = await prisma.company.findUnique({ where: { id: lead.companyId } });
    const contact = lead.contactId ? await prisma.contact.findUnique({ where: { id: lead.contactId } }) : null;
    return { lead, company, contact };
  }
  const company = await prisma.company.create({
    data: {
      legalName: lead.company || lead.name,
      tradeName: lead.company,
      email: lead.email,
      phone: lead.phone,
      status: "prospecto"
    }
  });
  const contact = await prisma.contact.create({
    data: {
      companyId: company.id,
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
  const email = value(formData, "customerEmail") || value(formData, "email");
  const name = value(formData, "customerName") || value(formData, "name") || "Cliente sin nombre";
  if (!email) return null;
  const { company, contact } = await upsertCompanyAndContactFromForm(formData);

  const client = await prisma.client.upsert({
    where: { email },
    update: {
      name,
      company: value(formData, "company"),
      phone: value(formData, "phone"),
      companyId: company?.id
    },
    create: {
      name,
      email,
      company: value(formData, "company"),
      phone: value(formData, "phone"),
      contactName: name,
      companyId: company?.id
    }
  });

  if (company) {
    await prisma.clientAccount.upsert({
      where: { clientId: client.id },
      update: {
        companyId: company.id,
        contactId: contact?.id
      },
      create: {
        clientId: client.id,
        userId: client.userId,
        companyId: company.id,
        contactId: contact?.id,
        status: client.userId ? "active" : "invited",
        invitedAt: client.userId ? null : new Date()
      }
    });
  }

  return client;
}

export async function deleteLeadAction(id: string) {
  await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  await createActivityLog({
    action: "DELETED",
    entityType: "Lead",
    entityId: id,
    leadId: id,
    title: "Lead archivado",
    body: "El lead fue marcado como eliminado sin borrar historial."
  });
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
}

export async function updateLeadStatusAction(id: string, formData: FormData) {
  const status = value(formData, "status") as "NEW" | "CONTACTED" | "QUALIFIED" | "EVALUATION" | "QUOTED" | "NEGOTIATION" | "WON" | "LOST" | "REQUIRES_TECH_SUPPORT";
  await prisma.lead.update({ where: { id }, data: { status } });
  revalidatePath("/admin/leads");
}

export async function updateLeadPipelineAction(id: string, formData: FormData) {
  await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
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
  const { session } = await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
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
  await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const { lead, company, contact } = await upsertCompanyAndContactFromLead(id);
  if (!company) throw new Error("No se pudo crear empresa para la oportunidad.");
  const existing = await prisma.opportunity.findUnique({ where: { leadId: id } });
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
  });
  await prisma.notification.create({
    data: {
      type: "LEAD",
      title: "Lead convertido en oportunidad",
      body: `${lead.name} - ${opportunity.title}`,
      href: "/admin/oportunidades"
    }
  });
  revalidatePath("/admin/leads");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/clientes");
  revalidatePath("/admin/notificaciones");
}

export async function convertOpportunityToQuoteAction(id: string, formData: FormData) {
  await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: { company: true, contact: true, lead: true, quotes: true }
  });
  if (!opportunity) throw new Error("Oportunidad no encontrada.");
  const now = new Date();
  const number = `COT-${now.getFullYear()}-${String(now.getTime()).slice(-7)}`;
  const unitPrice = numberValue(formData, "unitPrice", Number(opportunity.estimatedValue || 0));
  const quantity = Math.max(numberValue(formData, "quantity", 1), 1);
  const subtotal = unitPrice * quantity;
  const client = opportunity.contact?.email
    ? await prisma.client.upsert({
        where: { email: opportunity.contact.email },
        update: {
          name: opportunity.contact.name,
          company: opportunity.company.tradeName || opportunity.company.legalName,
          phone: opportunity.contact.phone,
          companyId: opportunity.companyId
        },
        create: {
          name: opportunity.contact.name,
          email: opportunity.contact.email,
          company: opportunity.company.tradeName || opportunity.company.legalName,
          phone: opportunity.contact.phone,
          contactName: opportunity.contact.name,
          companyId: opportunity.companyId
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
  });
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/cotizaciones");
}

export async function updateOrderStatusAction(id: string, formData: FormData) {
  const status = value(formData, "status") as "PENDING" | "QUOTED" | "PAID" | "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELLED";
  const notes = value(formData, "notes");
  await prisma.order.update({ where: { id }, data: { status, notes } });
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin");
}

export async function deleteOrderAction(id: string) {
  await prisma.order.delete({ where: { id } });
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin");
}

export async function createQuoteAction(formData: FormData) {
  await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
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

  const quote = await prisma.quote.create({
    data: {
      number,
      clientId: client?.id,
      companyId: company?.id || client?.companyId,
      contactId: contact?.id,
      opportunityId: nullableValue(formData, "opportunityId"),
      leadId: nullableValue(formData, "leadId"),
      sellerProfileId: nullableValue(formData, "sellerProfileId"),
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
          productId: nullableValue(formData, "productId"),
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
    leadId: nullableValue(formData, "leadId"),
    opportunityId: nullableValue(formData, "opportunityId")
  });
  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin");
}

export async function updateQuoteStatusAction(id: string, formData: FormData) {
  await requireActionRole(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
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
        amount
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
  });

  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/clientes");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin");
  if (quote.publicToken) revalidatePath(`/cotizaciones/${quote.publicToken}`);
}

export async function updateCommissionStatusAction(id: string, formData: FormData) {
  await requireActionRole(["ADMIN", "SUPER_ADMIN"]);
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
  await prisma.faq.create({
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

export async function updateFaqAction(id: string, formData: FormData) {
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
  await prisma.faq.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/faq");
}

export async function createPostAction(formData: FormData) {
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
      publishedAt: checked(formData, "isPublished") ? new Date() : null
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  redirect(`/admin/contenidos?blogStatus=created&item=${encodeURIComponent(title)}`);
}

export async function updatePostAction(id: string, formData: FormData) {
  const title = value(formData, "title") || "";
  const slug = value(formData, "slug") || slugify(title);
  const previousPost = await prisma.blogPost.findUnique({
    where: { id },
    select: { slug: true }
  });
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
  redirect(`/admin/contenidos?blogStatus=updated&item=${encodeURIComponent(title)}`);
}

export async function deletePostAction(id: string) {
  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: { title: true, slug: true }
  });
  await prisma.blogPost.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/blog");
  if (post?.slug) {
    revalidatePath(`/blog/${post.slug}`);
  }
  redirect(`/admin/contenidos?blogStatus=deleted&item=${encodeURIComponent(post?.title || "Post eliminado")}`);
}

export async function createServiceAction(formData: FormData) {
  const title = value(formData, "title") || "";
  await prisma.service.create({
    data: {
      title,
      slug: value(formData, "slug") || slugify(title),
      summary: value(formData, "summary") || "",
      content: contentFromText(formData) as Prisma.InputJsonValue,
      isPublished: checked(formData, "isPublished")
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/servicios");
}

export async function updateServiceAction(id: string, formData: FormData) {
  const title = value(formData, "title") || "";
  await prisma.service.update({
    where: { id },
    data: {
      title,
      slug: value(formData, "slug") || slugify(title),
      summary: value(formData, "summary") || "",
      content: contentFromText(formData) as Prisma.InputJsonValue,
      isPublished: checked(formData, "isPublished")
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/servicios");
}

export async function deleteServiceAction(id: string) {
  await prisma.service.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/servicios");
}

export async function createTestimonialAction(formData: FormData) {
  await prisma.testimonial.create({
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

export async function updateTestimonialAction(id: string, formData: FormData) {
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
  await prisma.testimonial.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function createClientLogoAction(formData: FormData) {
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
      active: checked(formData, "active")
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function updateClientLogoAction(id: string, formData: FormData) {
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
      active: checked(formData, "active")
    }
  });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function deleteClientLogoAction(id: string) {
  await prisma.clientLogo.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function createBannerAction(formData: FormData) {
  await prisma.banner.create({
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

export async function updateBannerAction(id: string, formData: FormData) {
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
  await prisma.banner.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
  revalidatePath("/");
}

export async function createCmsPageAction(formData: FormData) {
  const title = value(formData, "title") || "";
  await prisma.cmsPage.create({
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

export async function updateCmsPageAction(id: string, formData: FormData) {
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
  await prisma.cmsPage.delete({ where: { id } });
  revalidatePath("/admin/contenidos");
}

export async function takeChatConversationAction(id: string) {
  const { session } = await requireActionRole(["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const [profile, userId] = await Promise.all([
    session?.user?.id ? prisma.staffProfile.findUnique({ where: { userId: session.user.id } }) : null,
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
  await requireActionRole(["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const profileId = value(formData, "profileId");

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
  const { session, role } = await requireActionRole(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"]);
  if (!["ADMIN", "EDITOR", "SUPER_ADMIN", "COMMERCIAL_ADMIN"].includes(role)) {
    const profile = await prisma.staffProfile.findUnique({ where: { userId: session.user.id } });
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
  await requireActionRole(["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  await prisma.chatConversation.delete({ where: { id } });
  revalidatePath("/admin/chat");
  revalidatePath("/admin");
}

export async function sendAdminChatMessageAction(id: string, formData: FormData) {
  const body = value(formData, "body");
  if (!body) return;
  const { session, role } = await requireActionRole(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"]);
  const [profile, userId] = await Promise.all([
    prisma.staffProfile.findUnique({ where: { userId: session.user.id } }),
    existingUserId(session.user.id)
  ]);
  const conversation = await prisma.chatConversation.findUnique({
    where: { id },
    select: { assignedProfileId: true, assignedToId: true }
  });
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
  await requireActionRole(["ADMIN"]);
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
      active: checked(formData, "active")
    }
  });
  revalidatePath("/admin/equipo");
  revalidatePath("/admin/chat");
}

export async function updateStaffProfileAction(id: string, formData: FormData) {
  await requireActionRole(["ADMIN"]);
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
  await requireActionRole(["ADMIN", "SUPER_ADMIN"]);
  await prisma.staffProfile.update({
    where: { id },
    data: staffCommercialFieldsFromForm(formData)
  });
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/equipo");
}

export async function createProjectAction(formData: FormData) {
  await requireActionRole(projectAdminRoles);
  const title = value(formData, "title") || "";
  const clientId = nullableValue(formData, "clientId");
  const client = clientId ? await prisma.client.findUnique({ where: { id: clientId } }) : null;
  try {
    await prisma.project.create({
      data: {
        title,
        slug: value(formData, "slug") || slugify(title),
        clientId,
        companyId: nullableValue(formData, "companyId") || client?.companyId,
        opportunityId: nullableValue(formData, "opportunityId"),
        saleId: nullableValue(formData, "saleId"),
        clientName: value(formData, "clientName"),
        location: value(formData, "location"),
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
  revalidatePath("/proyectos");
  redirect(`/admin/proyectos?projectStatus=created&item=${encodeURIComponent(title)}`);
}

export async function createProjectFromSaleAction(id: string, formData: FormData) {
  await requireActionRole(["ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "ENGINEER"]);
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { quote: { include: { items: true } }, company: true, client: true }
  });
  if (!sale) throw new Error("Venta no encontrada.");
  const existing = await prisma.project.findFirst({ where: { saleId: id, deletedAt: null } });
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
  });
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/proyectos");
  revalidatePath("/admin/clientes");
}

export async function updateProjectAction(id: string, formData: FormData) {
  await requireActionRole(projectAdminRoles);
  const title = value(formData, "title") || "";
  const images = listFromTextarea(formData, "images");
  try {
    await prisma.project.update({
      where: { id },
      data: {
        title,
        slug: value(formData, "slug") || slugify(title),
        clientName: value(formData, "clientName"),
        location: value(formData, "location"),
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
  revalidatePath("/proyectos");
  redirect(`/admin/proyectos?projectStatus=updated&item=${encodeURIComponent(title)}`);
}

export async function deleteProjectAction(id: string) {
  await requireActionRole(projectAdminRoles);
  const project = await prisma.project.delete({ where: { id } });
  revalidatePath("/admin/proyectos");
  revalidatePath("/proyectos");
  redirect(`/admin/proyectos?projectStatus=deleted&item=${encodeURIComponent(project.title)}`);
}

export async function createProjectProgressAction(projectId: string, formData: FormData) {
  const { session } = await requireActionRole(["SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT", "EDITOR", "ADMIN", "SUPER_ADMIN"]);
  const title = value(formData, "title");
  const body = value(formData, "body");
  if (!title || !body) return;
  const profile = await prisma.staffProfile.findUnique({ where: { userId: session.user.id } });

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
  await requireActionRole(["ADMIN", "SUPER_ADMIN", "ENGINEER"]);
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
  await requireActionRole(["SUPPORT", "TECHNICIAN", "SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const status = (value(formData, "status") as TicketStatus | undefined) || "OPEN";
  await prisma.ticket.update({
    where: { id },
    data: {
      status,
      priority: (value(formData, "priority") as TicketPriority | undefined) || "MEDIUM",
      category: (value(formData, "category") as TicketCategory | undefined) || "TECHNICAL_QUERY",
      assignedProfileId: nullableValue(formData, "assignedProfileId"),
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
  const { session } = await requireActionRole(["SUPPORT", "TECHNICIAN", "SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);

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
  await requireActionRole(["ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const name = value(formData, "name");
  if (!name) return;
  await prisma.internalChatChannel.upsert({
    where: { slug: value(formData, "slug") || slugify(name) },
    update: {
      name,
      description: value(formData, "description")
    },
    create: {
      name,
      slug: value(formData, "slug") || slugify(name),
      description: value(formData, "description")
    }
  });
  revalidatePath("/admin/chat-interno");
}

export async function sendInternalMessageAction(channelId: string, formData: FormData) {
  const body = value(formData, "body");
  if (!body) return;
  const { session } = await requireActionRole(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);
  await prisma.internalChatMessage.create({
    data: {
      channelId,
      userId: session.user.id,
      body,
      files: listFromTextarea(formData, "files"),
      leadId: nullableValue(formData, "leadId"),
      projectId: nullableValue(formData, "projectId"),
      ticketId: nullableValue(formData, "ticketId")
    }
  });
  revalidatePath("/admin/chat-interno");
}

export async function reviewBotQuestionAction(id: string, formData: FormData) {
  await requireActionRole(["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
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
        active: true
      }
    });
  }

  revalidatePath("/admin/chatbot");
  revalidatePath("/admin/contenidos");
  revalidatePath("/faq");
}

export async function markNotificationReadAction(id: string) {
  const { session } = await requireActionRole(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);
  await prisma.notification.updateMany({
    where: { id, OR: [{ userId: session.user.id }, { userId: null }] },
    data: { readAt: new Date() }
  });
  revalidatePath("/admin/notificaciones");
}

export async function deleteStaffProfileAction(id: string) {
  await requireActionRole(["ADMIN"]);
  await prisma.staffProfile.delete({ where: { id } });
  revalidatePath("/admin/equipo");
  revalidatePath("/admin/chat");
}

export async function upsertStaffAccessAction(profileId: string, formData: FormData) {
  await requireActionRole(["ADMIN"]);

  const profile = await prisma.staffProfile.findUnique({
    where: { id: profileId },
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
    await prisma.user.update({ where: { id: profile.userId }, data });
  } else {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      await prisma.user.update({ where: { id: existingUser.id }, data });
      userId = existingUser.id;
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
  revalidatePath("/admin/equipo");
  revalidatePath("/admin/chat");
}

export async function unlinkStaffAccessAction(profileId: string) {
  await requireActionRole(["ADMIN"]);
  await prisma.staffProfile.update({
    where: { id: profileId },
    data: { userId: null }
  });
  revalidatePath("/admin/equipo");
  revalidatePath("/admin/chat");
}

export async function approveClientAccountAction(accountId: string) {
  await requireActionRole(["ADMIN", "SUPER_ADMIN"]);
  const account = await prisma.clientAccount.update({
    where: { id: accountId },
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
      href: `/admin/clientes${account.clientId ? `/${account.clientId}` : ""}`
    }
  });

  revalidatePath("/admin/clientes");
  revalidatePath("/portal");
}

export async function rejectClientAccountAction(accountId: string) {
  await requireActionRole(["ADMIN", "SUPER_ADMIN"]);
  const account = await prisma.clientAccount.update({
    where: { id: accountId },
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
