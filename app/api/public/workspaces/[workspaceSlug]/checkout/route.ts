import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createEmailVerificationToken, sendEmailVerificationCode } from "@/lib/server/email-verification";
import { getSubdivisionName } from "@/lib/locations";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";

type RouteContext = { params: Promise<{ workspaceSlug: string }> };

const publicCheckoutSchema = z.object({
  workspaceSlug: z.string().trim().optional(),
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    slug: z.string().trim().optional(),
    quantity: z.coerce.number().int().positive(),
  })).min(1),
  totals: z.object({
    subtotal: z.coerce.number().nonnegative().optional(),
    igv: z.coerce.number().nonnegative().optional(),
    shipping: z.coerce.number().nonnegative().optional(),
    total: z.coerce.number().nonnegative().optional(),
  }).optional(),
  shippingMethod: z.string().trim().default("standard"),
  paymentMethod: z.enum(["bank", "card", "delivery"]).default("bank"),
  customerType: z.string().trim().default("person"),
  customer: z.object({
    customerType: z.string().trim().optional(),
    name: z.string().trim().min(2),
    document: z.string().trim().min(6),
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(6),
    address: z.string().trim().min(5),
    reference: z.string().trim().optional(),
    country: z.string().trim().length(2).default("PE"),
    subdivision: z.string().trim().optional(),
    city: z.string().trim().optional(),
    department: z.string().trim().default("Lima"),
    province: z.string().trim().default("Lima"),
    district: z.string().trim().default("Lima"),
  }),
});

function createTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(randomBytes(12), (value) => alphabet[value % alphabet.length]).join("");
}

function paymentInstructions(method: "bank" | "card" | "delivery") {
  if (method === "card") {
    return "Cuando el asesor valide stock y monto final, enviaremos al perfil del cliente un enlace seguro de pago con tarjeta.";
  }
  if (method === "delivery") {
    return "El equipo comercial validara cobertura de pago contra entrega y publicara la confirmacion en el perfil del cliente.";
  }
  return "Los datos de transferencia bancaria, CCI e instrucciones para adjuntar comprobante se enviaran al perfil del cliente.";
}

function orderCode() {
  return `ICC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeItems(items: Array<{ productId: string; quantity: number }>) {
  return items
    .map((item) => `${item.productId}:${item.quantity}`)
    .sort()
    .join("|");
}

function portalAccountUrl(workspaceSlug: string) {
  const baseUrl = process.env.TERRAQO_PORTAL_URL || process.env.NEXT_PUBLIC_TERRAQO_PORTAL_URL || "https://portal.terraqoglobal.com";
  return `${baseUrl.replace(/\/$/, "")}/cuenta?workspace=${encodeURIComponent(workspaceSlug)}`;
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params;
    const payload = await parseJson(request, publicCheckoutSchema);
    const workspace = await prisma.terraqoWorkspace.findFirst({
      where: { slug: workspaceSlug, active: true },
      select: { id: true, slug: true },
    });
    if (!workspace) return fail("Workspace no encontrado.", 404);

    const requestedKeys = payload.items.flatMap((item) => [item.productId, item.slug].filter(Boolean) as string[]);
    const products = await prisma.product.findMany({
      where: {
        terraqoWorkspaceId: workspace.id,
        isActive: true,
        isVisible: true,
        OR: [{ id: { in: requestedKeys } }, { slug: { in: requestedKeys } }],
      },
    });

    const productByKey = new Map<string, (typeof products)[number]>();
    products.forEach((product) => {
      productByKey.set(product.id, product);
      productByKey.set(product.slug, product);
    });

    const missingItem = payload.items.find((item) => !productByKey.get(item.productId) && (!item.slug || !productByKey.get(item.slug)));
    if (missingItem) return fail(`Producto no disponible para este workspace: ${missingItem.productId}`, 404);

    const orderItems = payload.items.map((item) => {
      const product = productByKey.get(item.productId) || (item.slug ? productByKey.get(item.slug) : undefined);
      if (!product) throw new Error("Producto no encontrado");
      const unitPrice = product.price || new Prisma.Decimal(0);
      return {
        productId: product.id,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice.mul(item.quantity),
      };
    });

    const canonicalItems = normalizeItems(orderItems);
    const itemSubtotal = orderItems.reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0));
    const total = new Prisma.Decimal(payload.totals?.total ?? Number(itemSubtotal));
    const recentSince = new Date(Date.now() - 10 * 60 * 1000);

    const documentOwner = await prisma.client.findFirst({
      where: {
        terraqoWorkspaceId: workspace.id,
        document: payload.customer.document,
        deletedAt: null,
        NOT: { email: payload.customer.email },
      },
      select: { email: true },
    });
    if (documentOwner) {
      return fail("El DNI/RUC ya esta asociado a otro correo en este portal. Ingresa con la cuenta existente o solicita actualizacion de correo.", 409);
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email: payload.customer.email } });
      const temporaryPassword = existingUser?.passwordHash ? null : createTemporaryPassword();
      const passwordHash = temporaryPassword ? await bcrypt.hash(temporaryPassword, 12) : undefined;
      const locationCity = payload.customer.city || payload.customer.district;
      const locationRegion = getSubdivisionName(payload.customer.country, payload.customer.subdivision)
        || [payload.customer.department, payload.customer.province].filter(Boolean).join(" / ");
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              name: existingUser.name || payload.customer.name,
              passwordHash: existingUser.passwordHash || passwordHash,
            },
          })
        : await tx.user.create({
            data: {
              name: payload.customer.name,
              email: payload.customer.email,
              passwordHash,
              role: "CUSTOMER",
            },
          });

      const companyName = payload.customerType === "company" ? payload.customer.name : payload.customer.name;
      const company = await tx.company.findFirst({
        where: {
          terraqoWorkspaceId: workspace.id,
          deletedAt: null,
          OR: [
            { document: payload.customer.document },
            { email: payload.customer.email },
            { contacts: { some: { email: payload.customer.email, deletedAt: null } } },
          ],
        },
        include: { contacts: { where: { email: payload.customer.email, deletedAt: null }, take: 1 } },
      }) || await tx.company.create({
        data: {
          terraqoWorkspaceId: workspace.id,
          legalName: companyName,
          tradeName: companyName,
          document: payload.customer.document,
          email: payload.customer.email,
          phone: payload.customer.phone,
          address: payload.customer.address,
          city: locationCity,
          country: payload.customer.country,
          region: locationRegion,
          locationSubdivisionCode: payload.customer.subdivision,
          locationCity,
          status: "cliente_activo",
          contacts: {
            create: {
              terraqoWorkspaceId: workspace.id,
              name: payload.customer.name,
              email: payload.customer.email,
              phone: payload.customer.phone,
              whatsapp: payload.customer.phone,
              isPrimary: true,
            },
          },
        },
        include: { contacts: true },
      });

      const contact = company.contacts[0] || await tx.contact.create({
        data: {
          terraqoWorkspaceId: workspace.id,
          companyId: company.id,
          name: payload.customer.name,
          email: payload.customer.email,
          phone: payload.customer.phone,
          whatsapp: payload.customer.phone,
          isPrimary: true,
        },
      });

      const client = await tx.client.upsert({
        where: { terraqoWorkspaceId_email: { terraqoWorkspaceId: workspace.id, email: payload.customer.email } },
        update: {
          userId: user.id,
          companyId: company.id,
          name: payload.customer.name,
          company: companyName,
          document: payload.customer.document,
          phone: payload.customer.phone,
          address: payload.customer.address,
          country: payload.customer.country,
          region: locationRegion,
          locationSubdivisionCode: payload.customer.subdivision,
          locationCity,
          contactName: payload.customer.name,
          status: "activo",
        },
        create: {
          terraqoWorkspaceId: workspace.id,
          userId: user.id,
          companyId: company.id,
          name: payload.customer.name,
          company: companyName,
          document: payload.customer.document,
          email: payload.customer.email,
          phone: payload.customer.phone,
          address: payload.customer.address,
          country: payload.customer.country,
          region: locationRegion,
          locationSubdivisionCode: payload.customer.subdivision,
          locationCity,
          contactName: payload.customer.name,
          status: "activo",
        },
      });

      await tx.clientAccount.upsert({
        where: { terraqoWorkspaceId_userId: { terraqoWorkspaceId: workspace.id, userId: user.id } },
        update: {
          companyId: company.id,
          contactId: contact.id,
          clientId: client.id,
          status: "active",
        },
        create: {
          terraqoWorkspaceId: workspace.id,
          userId: user.id,
          companyId: company.id,
          contactId: contact.id,
          clientId: client.id,
          status: "active",
          invitedAt: new Date(),
        },
      });

      await tx.terraqoWorkspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
        update: { title: companyName, active: true, joinedAt: new Date() },
        create: { workspaceId: workspace.id, userId: user.id, role: "CLIENT", title: companyName, active: true, joinedAt: new Date() },
      });

      const existingOrders = await tx.order.findMany({
        where: {
          terraqoWorkspaceId: workspace.id,
          userId: user.id,
          customerEmail: payload.customer.email,
          status: "PENDING",
          createdAt: { gte: recentSince },
        },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const reusableOrder = existingOrders.find((order) => normalizeItems(order.items) === canonicalItems);

      const publicOrderCode = reusableOrder?.notes?.match(/Codigo publico: ([A-Z0-9-]+)/)?.[1] || orderCode();
      const address = reusableOrder ? null : await tx.address.create({
        data: {
          userId: user.id,
          label: "Entrega tienda tecnica",
          line1: payload.customer.address,
          line2: payload.customer.reference,
          city: locationCity,
          region: locationRegion,
          subdivisionCode: payload.customer.subdivision,
          country: payload.customer.country,
        },
      });

      const order = reusableOrder || await tx.order.create({
        data: {
          userId: user.id,
          customerEmail: payload.customer.email,
          customerName: payload.customer.name,
          customerPhone: payload.customer.phone,
          terraqoWorkspaceId: workspace.id,
          status: "PENDING",
          total,
          currency: orderItems[0]?.unitPrice ? products[0]?.currency || "USD" : "USD",
          addressId: address?.id,
          notes: [
            `Codigo publico: ${publicOrderCode}`,
            `Metodo de pago: ${payload.paymentMethod}`,
            `Metodo de envio: ${payload.shippingMethod}`,
            payload.customer.reference ? `Referencia: ${payload.customer.reference}` : null,
          ].filter(Boolean).join("\n"),
          items: { create: orderItems },
        },
      });

      if (!reusableOrder) {
        await tx.notification.create({
          data: {
            terraqoWorkspaceId: workspace.id,
            type: "SYSTEM",
            title: "Nuevo pedido de tienda tecnica",
            body: `${payload.customer.name} registro un pedido por ${payload.paymentMethod}.`,
            href: "/admin/ventas",
          },
        });
      }

      const verification = temporaryPassword ? await createEmailVerificationToken(tx, payload.customer.email) : null;

      return { order, user, temporaryPassword, verificationCode: verification?.code, reusedOrder: Boolean(reusableOrder), existingUser: Boolean(existingUser?.passwordHash) };
    });

    const emailDelivery = result.verificationCode
      ? await sendEmailVerificationCode(result.user.email, result.verificationCode)
      : { delivered: true as const };

    return ok({
      ok: true,
      id: result.order.notes?.match(/Codigo publico: ([A-Z0-9-]+)/)?.[1] || result.order.id,
      workspaceSlug: workspace.slug,
      status: "PENDING_PAYMENT_INSTRUCTIONS",
      reusedOrder: result.reusedOrder,
      profile: {
        email: result.user.email,
        temporaryPassword: result.temporaryPassword,
        accountUrl: portalAccountUrl(workspace.slug),
        role: "CUSTOMER",
        emailVerificationRequired: Boolean(result.temporaryPassword),
        emailDelivery: emailDelivery.delivered ? "sent" : "provider_not_configured",
        status: result.existingUser ? "EXISTING" : "CREATED",
      },
      paymentInstructions: paymentInstructions(payload.paymentMethod),
    }, { status: result.reusedOrder ? 200 : 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
