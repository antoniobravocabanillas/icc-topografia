import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError } from "@/lib/server/api";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { checkoutSchema } from "@/lib/validations/commerce";

export async function POST(request: Request) {
  try {
    const payload = checkoutSchema.parse(await request.json());
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
    const productIds = payload.items.map((item) => item.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, isActive: true, terraqoWorkspaceId } });

    if (products.length !== productIds.length) {
      return fail("Uno o mas productos no existen", 404);
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const hasQuoteOnly = products.some((product) => product.requiresQuote || !product.price);
    if (hasQuoteOnly) {
      return fail("El carrito contiene productos que requieren cotizacion", 409);
    }

    const outOfStockItem = payload.items.find((item) => {
      const product = productMap.get(item.productId);
      return !product || product.stock < item.quantity;
    });

    if (outOfStockItem) {
      const product = productMap.get(outOfStockItem.productId);
      return fail(`Stock insuficiente para ${product?.name || "uno de los productos"}`, 409);
    }

    const items = payload.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product?.price) throw new Error("Producto sin precio");
      const unitPrice = product.price;
      const subtotal = unitPrice.mul(item.quantity);
      return { productId: item.productId, quantity: item.quantity, unitPrice, subtotal };
    });

    const total = items.reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0));

    const order = await prisma.order.create({
      data: {
        customerEmail: payload.email,
        customerName: payload.name,
        customerPhone: payload.phone,
        notes: payload.notes,
        terraqoWorkspace: { connect: { id: terraqoWorkspaceId } },
        status: "PENDING",
        total,
        address: payload.address ? { create: payload.address } : undefined,
        items: { create: items }
      },
      include: { items: { include: { product: true } }, address: true }
    });

    return NextResponse.json({ ok: true, id: order.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
