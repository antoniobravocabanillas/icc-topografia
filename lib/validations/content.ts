import { z } from "zod";

export const serviceInputSchema = z.object({
  title: z.string().trim().min(2),
  slug: z.string().trim().min(2).optional(),
  category: z.string().trim().optional().nullable(),
  categoryId: z.string().trim().optional().nullable(),
  subcategoryId: z.string().trim().optional().nullable(),
  isFeatured: z.coerce.boolean().default(false),
  status: z.string().trim().default("ACTIVE"),
  icon: z.string().trim().optional().nullable(),
  cover: z.string().trim().optional().nullable(),
  gallery: z.array(z.string().trim()).default([]),
  video: z.string().trim().optional().nullable(),
  headline: z.string().trim().optional().nullable(),
  summary: z.string().trim().min(10),
  benefits: z.array(z.string().trim()).default([]),
  applications: z.array(z.string().trim()).default([]),
  deliverables: z.array(z.string().trim()).default([]),
  technologies: z.array(z.string().trim()).default([]),
  precision: z.string().trim().optional().nullable(),
  formats: z.array(z.string().trim()).default([]),
  compatibility: z.array(z.string().trim()).default([]),
  seoTitle: z.string().trim().optional().nullable(),
  metaDescription: z.string().trim().optional().nullable(),
  ogImage: z.string().trim().optional().nullable(),
  relatedProjects: z.array(z.string().trim()).default([]),
  successCases: z.array(z.string().trim()).default([]),
  relatedServices: z.array(z.string().trim()).default([]),
  sectorSlugs: z.array(z.string().trim()).default([]),
  content: z.record(z.unknown()).default({}),
  isPublished: z.coerce.boolean().default(true)
});

export const serviceUpdateSchema = serviceInputSchema.partial();

export const postInputSchema = z.object({
  title: z.string().trim().min(2),
  slug: z.string().trim().min(2).optional(),
  excerpt: z.string().trim().min(10),
  content: z.record(z.unknown()).default({}),
  author: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  metaTitle: z.string().trim().optional().nullable(),
  metaDesc: z.string().trim().optional().nullable(),
  publishedAt: z.coerce.date().optional().nullable()
});

export const postUpdateSchema = postInputSchema.partial();

export const faqInputSchema = z.object({
  question: z.string().trim().min(5),
  answer: z.string().trim().min(5),
  category: z.string().trim().optional().nullable(),
  position: z.coerce.number().int().default(0),
  active: z.coerce.boolean().default(true)
});

export const faqUpdateSchema = faqInputSchema.partial();
