"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { QuoteStatus, TicketCategory, TicketPriority } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

function value(formData: FormData, key: string) {
  const input = formData.get(key);
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function listFromTextarea(formData: FormData, key: string) {
  return (value(formData, key) || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function requireClient() {
  const session = await auth();
  if (!session?.user?.email) redirect("/cuenta?callbackUrl=/portal");
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();

  const account = await prisma.clientAccount.findFirst({
    where: {
      OR: [{ userId: session.user.id }, { user: { email: session.user.email } }],
      terraqoWorkspaceId,
      deletedAt: null
    },
    include: { client: true, company: true, contact: true }
  });

  if (!account || !["active", "approved"].includes(account.status)) {
    redirect("/portal?status=pending_approval");
  }

  const client = account.client || await prisma.client.upsert({
    where: { email: session.user.email },
    update: { userId: session.user.id, companyId: account.companyId, terraqoWorkspaceId },
    create: {
      userId: session.user.id,
      companyId: account.companyId,
      terraqoWorkspaceId,
      name: account.contact?.name || session.user.name || session.user.email,
      company: account.company.tradeName || account.company.legalName,
      email: session.user.email,
      phone: account.contact?.phone || account.company.phone,
      contactName: account.contact?.name || session.user.name || session.user.email
    }
  });

  return { session, client, account, terraqoWorkspaceId };
}

function ticketCode() {
  const now = new Date();
  return `TK-${now.getFullYear()}-${String(now.getTime()).slice(-7)}`;
}

export async function updateClientProfileAction(formData: FormData) {
  const { client, account } = await requireClient();
  const name = value(formData, "name") || client.name;
  const company = value(formData, "company") || client.company || account.company.legalName;
  const document = value(formData, "document");
  const phone = value(formData, "phone");
  const address = value(formData, "address");
  const contactName = value(formData, "contactName") || name;

  await prisma.client.update({
    where: { id: client.id },
    data: {
      name,
      company,
      document,
      phone,
      address,
      contactName
    }
  });

  await prisma.company.update({
    where: { id: account.companyId },
    data: {
      legalName: company,
      tradeName: company,
      document,
      phone,
      address
    }
  });

  if (account.contactId) {
    await prisma.contact.update({
      where: { id: account.contactId },
      data: {
        name: contactName,
        phone,
        whatsapp: phone
      }
    });
  }

  revalidatePath("/portal");
  redirect("/portal?success=profile");
}

export async function createCustomerTicketAction(formData: FormData) {
  const { client, terraqoWorkspaceId } = await requireClient();
  const subject = value(formData, "subject");
  const description = value(formData, "description");
  if (!subject || !description) return;

  await prisma.ticket.create({
    data: {
      code: ticketCode(),
      clientId: client.id,
      terraqoWorkspaceId,
      customerName: client.name,
      customerEmail: client.email,
      company: client.company,
      subject,
      description,
      category: (value(formData, "category") as TicketCategory | undefined) || "TECHNICAL_QUERY",
      priority: (value(formData, "priority") as TicketPriority | undefined) || "MEDIUM",
      attachments: listFromTextarea(formData, "attachments"),
      messages: {
        create: {
          sender: "customer",
          body: description,
          files: listFromTextarea(formData, "attachments")
        }
      }
    }
  });
  await prisma.notification.create({
    data: {
      type: "TICKET",
      title: "Nuevo ticket de cliente",
      body: `${client.name} solicito soporte: ${subject}`,
      href: "/admin/tickets"
    }
  });
  revalidatePath("/portal");
  revalidatePath("/admin/tickets");
  revalidatePath("/admin/notificaciones");
  redirect("/portal?success=ticket");
}

export async function replyCustomerTicketAction(ticketId: string, formData: FormData) {
  const { client } = await requireClient();
  const body = value(formData, "body");
  if (!body) return;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { clientId: true }
  });
  if (ticket?.clientId !== client.id) throw new Error("Ticket no disponible para este cliente.");

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: "REVIEWING",
      messages: {
        create: {
          sender: "customer",
          body,
          files: listFromTextarea(formData, "files")
        }
      }
    }
  });
  revalidatePath("/portal");
  revalidatePath("/admin/tickets");
  redirect("/portal?success=reply");
}

export async function respondPublicQuoteAction(token: string, status: QuoteStatus) {
  if (status !== "ACCEPTED" && status !== "REJECTED") return;
  const quote = await prisma.quote.update({
    where: { publicToken: token },
    data: {
      status,
      acceptedAt: status === "ACCEPTED" ? new Date() : null,
      rejectedAt: status === "REJECTED" ? new Date() : null
    },
    include: { sellerProfile: true, commissions: true }
  });

  if (status === "ACCEPTED" && quote.sellerProfileId && !quote.commissions.length) {
    const rate = Number(quote.sellerProfile?.commissionRate || 0);
    await prisma.commission.create({
      data: {
        quoteId: quote.id,
        sellerProfileId: quote.sellerProfileId,
        type: quote.sellerProfile?.commissionType || "SALE_PERCENTAGE",
        baseAmount: quote.total,
        rate,
        amount: Number(quote.total) * (rate / 100)
      }
    });
  }

  await prisma.notification.create({
    data: {
      type: "QUOTE",
      title: status === "ACCEPTED" ? "Cotizacion aceptada" : "Cotizacion rechazada",
      body: `${quote.customerName} actualizo ${quote.number}`,
      href: "/admin/cotizaciones"
    }
  });

  revalidatePath(`/cotizaciones/${token}`);
  revalidatePath("/portal");
  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/notificaciones");
}

export async function respondPublicQuoteFromFormAction(token: string, formData: FormData) {
  const status = value(formData, "status") as QuoteStatus | undefined;
  if (!status) return;
  await respondPublicQuoteAction(token, status);
  const redirectTo = value(formData, "redirectTo");
  redirect(redirectTo || `/cotizaciones/${token}?success=${status === "ACCEPTED" ? "quote_accepted" : "quote_rejected"}`);
}
