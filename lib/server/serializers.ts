import type { Prisma } from "@prisma/client";

type ProductWithCategory = Prisma.ProductGetPayload<{
  include: { category: true; variants: true };
}>;

export type StoreProduct = ReturnType<typeof serializeProduct>;

type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: { include: { product: true } }; address: true };
}>;

export function serializeProduct(product: ProductWithCategory) {
  return {
    ...product,
    price: product.price ? Number(product.price) : null,
    rentalPrice: product.rentalPrice ? Number(product.rentalPrice) : null,
    variants: product.variants.map((variant) => ({
      ...variant,
      price: variant.price ? Number(variant.price) : null
    }))
  };
}

export function serializeOrder(order: OrderWithItems) {
  return {
    ...order,
    total: Number(order.total),
    items: order.items.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
      product: {
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        sku: item.product.sku
      }
    }))
  };
}
