"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { QuoteStatus, TicketCategory, TicketPriority } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {transitionQuote,QuoteStateError} from "./quote-state";
import {hasWorkspaceModule} from "@/lib/terraqo/workspace-scope";
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
  if (!session?.user?.email) redirect("/cuenta");
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

  const existingClient = account.client || await prisma.client.findFirst({
    where: { email: session.user.email, terraqoWorkspaceId, deletedAt: null }
  });
  const client = existingClient
    ? await prisma.client.update({
        where: { id: existingClient.id },
        data: { userId: session.user.id, companyId: account.companyId }
      })
    : await prisma.client.create({
        data: {
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
  const { client, account, terraqoWorkspaceId } = await requireClient();
  const name = value(formData, "name") || client.name;
  const company = value(formData, "company") || client.company || account.company.legalName;
  const document = value(formData, "document");
  const phone = value(formData, "phone");
  const address = value(formData, "address");
  const contactName = value(formData, "contactName") || name;

  await prisma.client.updateMany({
    where: { id: client.id, terraqoWorkspaceId },
    data: {
      name,
      company,
      document,
      phone,
      address,
      contactName
    }
  });

  await prisma.company.updateMany({
    where: { id: account.companyId, terraqoWorkspaceId },
    data: {
      legalName: company,
      tradeName: company,
      document,
      phone,
      address
    }
  });

  if (account.contactId) {
    await prisma.contact.updateMany({
      where: { id: account.contactId, terraqoWorkspaceId },
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
      terraqoWorkspaceId,
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
  const { client, terraqoWorkspaceId } = await requireClient();
  const body = value(formData, "body");
  if (!body) return;

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, terraqoWorkspaceId },
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

export async function respondPublicQuoteAction(token: string, status: QuoteStatus, version?:string) {
  if (!["ACCEPTED","REJECTED"].includes(status) || !/^[a-zA-Z0-9_-]{16,128}$/.test(token)) throw new QuoteStateError("Respuesta no válida.",422);
  const quote=await prisma.quote.findFirst({where:{publicToken:token,deletedAt:null,status:{not:"DRAFT"},terraqoWorkspace:{active:true,deletedAt:null}},select:{terraqoWorkspaceId:true}});
  if (!quote || !await hasWorkspaceModule("CRM",quote.terraqoWorkspaceId)) throw new QuoteStateError("Cotización no disponible.",404);
  await transitionQuote({workspaceId:quote.terraqoWorkspaceId,publicToken:token,source:"public",status,version});
  for (const path of [`/cotizaciones/${token}`,"/portal","/portal/operaciones","/admin/cotizaciones","/admin/ventas","/admin/notificaciones"]) revalidatePath(path);
}

export async function respondPublicQuoteFromFormAction(token: string, formData: FormData) {
  const status=value(formData,"status"),version=value(formData,"version");
  const requested=value(formData,"redirectTo");
  // Accept only the two existing portal destinations. Never navigate to an
  // arbitrary URL supplied in a public form.
  const destination=requested?.startsWith("/portal/operaciones?") ? "/portal/operaciones" : requested?.startsWith("/portal?") ? "/portal" : `/cotizaciones/${encodeURIComponent(token)}`;
  try {
    if (!version || !Number.isFinite(Date.parse(version)) || status!=="ACCEPTED" && status!=="REJECTED") throw new QuoteStateError("Respuesta no válida.",422);
    await respondPublicQuoteAction(token,status,version);
  } catch(error) {
    if (!(error instanceof QuoteStateError)) throw error;
    redirect(`${destination}?error=${error.status===409?"quote_conflict":error.status===422?"quote_review":"quote_unavailable"}`);
  }
  redirect(`${destination}?success=${status==="ACCEPTED"?"quote_accepted":"quote_rejected"}`);
}
