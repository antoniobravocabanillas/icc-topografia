import { z } from "zod";

export const checkoutSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(2),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  items: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().int().positive() })).min(1),
  address: z.object({
    line1: z.string().trim().min(5),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(2),
    region: z.string().trim().optional(),
    subdivisionCode: z.string().trim().optional(),
    country: z.string().trim().default("PE"),
    postalCode: z.string().trim().optional()
  }).optional()
});

export const orderStatusSchema = z.object({
  status: z.enum(["PENDING", "QUOTED", "PAID", "PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED"]),
  notes: z.string().trim().optional().nullable()
});

export const favoriteInputSchema = z.object({
  productId: z.string().min(1)
});
