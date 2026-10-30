import { z } from "zod";
import { sparseUpdateSchema } from "./common";

export const productInputSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2).optional(),
  sku: z.string().trim().min(2),
  brand: z.string().trim().min(2),
  model: z.string().trim().optional().nullable(),
  summary: z.string().trim().min(10),
  description: z.string().trim().min(10),
  price: z.coerce.number().positive().optional().nullable(),
  stock: z.coerce.number().int().min(0).default(0),
  currency: z.string().trim().min(3).max(3).default("USD"),
  requiresQuote: z.coerce.boolean().default(false),
  availability: z.string().trim().min(2),
  badge: z.string().trim().optional().nullable(),
  images: z.array(z.string().url().or(z.string().startsWith("/"))).default([]),
  technicalSheet: z.string().url().or(z.string().startsWith("/")).optional().nullable(),
  specifications: z.record(z.string(), z.string()).default({}),
  categoryId: z.string().min(1)
});

export const productUpdateSchema = sparseUpdateSchema(productInputSchema.shape);

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2).optional(),
  description: z.string().trim().optional().nullable(),
  parentId: z.string().optional().nullable()
});

export const categoryUpdateSchema = sparseUpdateSchema(categoryInputSchema.shape);
