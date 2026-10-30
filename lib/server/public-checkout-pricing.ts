import { Prisma } from "@prisma/client";

export const MAX_PUBLIC_CHECKOUT_QUANTITY = 10_000;
export const MAX_PUBLIC_CHECKOUT_ITEMS = 25;
export const MAX_PUBLIC_CHECKOUT_TOTAL_QUANTITY = 10_000;

export type PublicCheckoutPricedItem = {
  productId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
};

type PublicCheckoutPriceInput = {
  productId: string;
  quantity: number;
  price: Prisma.Decimal | null;
  currency: string;
  requiresQuote: boolean;
};

export class PublicCheckoutPricingError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_CART"
      | "DUPLICATE_PRODUCT"
      | "INVALID_QUANTITY"
      | "QUOTE_REQUIRED"
      | "INVALID_PRICE"
      | "MIXED_CURRENCY",
  ) {
    super(message);
    this.name = "PublicCheckoutPricingError";
  }
}

export function calculatePublicCheckoutPrice(inputs: PublicCheckoutPriceInput[]) {
  if (inputs.length === 0 || inputs.length > MAX_PUBLIC_CHECKOUT_ITEMS) {
    throw new PublicCheckoutPricingError(
      `El pedido admite entre 1 y ${MAX_PUBLIC_CHECKOUT_ITEMS} productos.`,
      "INVALID_CART",
    );
  }

  const productIds = new Set<string>();
  let totalQuantity = 0;
  for (const input of inputs) {
    if (productIds.has(input.productId)) {
      throw new PublicCheckoutPricingError(
        "Cada producto debe aparecer una sola vez en el pedido.",
        "DUPLICATE_PRODUCT",
      );
    }
    productIds.add(input.productId);
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0 || input.quantity > MAX_PUBLIC_CHECKOUT_QUANTITY) {
      throw new PublicCheckoutPricingError("La cantidad solicitada no es válida.", "INVALID_QUANTITY");
    }
    totalQuantity += input.quantity;
    if (!Number.isSafeInteger(totalQuantity) || totalQuantity > MAX_PUBLIC_CHECKOUT_TOTAL_QUANTITY) {
      throw new PublicCheckoutPricingError(
        `El pedido no puede superar ${MAX_PUBLIC_CHECKOUT_TOTAL_QUANTITY} unidades en total.`,
        "INVALID_QUANTITY",
      );
    }
  }

  const currencies = new Set<string>();
  const items: PublicCheckoutPricedItem[] = inputs.map((input) => {
    if (input.requiresQuote) {
      throw new PublicCheckoutPricingError("Uno de los productos requiere una cotización antes de crear el pedido.", "QUOTE_REQUIRED");
    }
    if (!input.price || input.price.lessThanOrEqualTo(0)) {
      throw new PublicCheckoutPricingError("Uno de los productos no tiene un precio de venta válido.", "INVALID_PRICE");
    }

    const currency = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new PublicCheckoutPricingError("La moneda configurada para el producto no es válida.", "MIXED_CURRENCY");
    }
    currencies.add(currency);

    return {
      productId: input.productId,
      quantity: input.quantity,
      unitPrice: input.price,
      subtotal: input.price.mul(input.quantity),
    };
  });

  if (currencies.size !== 1) {
    throw new PublicCheckoutPricingError("Todos los productos del pedido deben usar la misma moneda.", "MIXED_CURRENCY");
  }

  return {
    items,
    currency: [...currencies][0],
    total: items.reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0)),
  };
}
