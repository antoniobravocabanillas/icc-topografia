import {Prisma} from "@prisma/client";
import {z} from "zod";

// Accept decimal strings only. Never construct financial decimals from a binary
// floating-point intermediate; reject rounding instead of silently changing input.
export const quoteMoneySchema = z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/);
export const quoteLineSchema = z.object({description: z.string().trim().min(1).max(500),
  quantity: z.number().int().min(1).max(10000), unitPrice: quoteMoneySchema,
  discount: quoteMoneySchema.default("0")}).strict();
export const quoteAmountsSchema = z.object({currency: z.enum(["PEN", "USD"]),
  items: z.array(quoteLineSchema).min(1).max(50), tax: quoteMoneySchema.default("0")}).strict();
export type QuoteAmountsInput = z.input<typeof quoteAmountsSchema>;
export function calculateQuoteAmounts(input: QuoteAmountsInput) {
  const parsed = quoteAmountsSchema.parse(input);
  let subtotal = new Prisma.Decimal(0), discount = new Prisma.Decimal(0);
  const items = parsed.items.map(item => {
    const price = new Prisma.Decimal(item.unitPrice), reduction = new Prisma.Decimal(item.discount);
    const gross = price.mul(item.quantity);
    if (reduction.gt(gross)) throw new Error("El descuento no puede superar el importe de la línea.");
    subtotal = subtotal.add(gross); discount = discount.add(reduction);
    return {...item, unitPrice: price, discount: reduction, subtotal: gross.sub(reduction)};
  });
  const tax = new Prisma.Decimal(parsed.tax), total = subtotal.sub(discount).add(tax);
  if (total.gt("99999999999.99")) throw new Error("El total supera el importe permitido.");
  return {currency: parsed.currency, items, subtotal, discount, tax, total};
}
