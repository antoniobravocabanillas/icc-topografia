import { z } from "zod";

export const terraqoWorkspaceCreateSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  type: z.enum(["CLIENT_COMPANY", "INTERNAL_UNIT", "PRODUCT_ADMIN"]).default("CLIENT_COMPANY"),
  industry: z.string().optional(),
  description: z.string().optional(),
  companyId: z.string().optional(),
  ownerUserId: z.string().optional(),
  brandName: z.string().optional(),
  domain: z.string().optional(),
  logoUrl: z.string().optional(),
  plan: z.enum(["FREE", "BASIC", "PROFESSIONAL", "PREMIUM", "ENTERPRISE"]).default("BASIC")
});

export const terraqoModuleUpdateSchema = z.object({
  code: z.enum([
    "CRM",
    "PROJECTS",
    "PUBLIC_WEBSITE",
    "TECHNICAL_STORE",
    "PROFESSIONAL_NETWORK",
    "LIVE_CV",
    "JOB_MARKETPLACE",
    "FORUMS",
    "ANALYTICS",
    "AUTOMATIONS",
    "DOCUMENTS"
  ]),
  active: z.boolean(),
  config: z.unknown().optional()
});

export const terraqoProfessionalProfileSchema = z.object({
  headline: z.string().max(180).optional(),
  bio: z.string().max(1400).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(2).default("PE"),
  status: z.enum(["AVAILABLE", "WORKING", "OPEN_TO_PROJECTS", "NOT_AVAILABLE"]).default("OPEN_TO_PROJECTS"),
  visibility: z.enum(["PUBLIC", "COMMUNITY", "WORKSPACE", "PRIVATE"]).default("PRIVATE"),
  yearsExperience: z.number().int().min(0).max(80).optional(),
  specialties: z.array(z.string().min(1)).default([]),
  equipment: z.array(z.string().min(1)).default([]),
  software: z.array(z.string().min(1)).default([]),
  certifications: z.array(z.string().min(1)).default([]),
  portfolioUrl: z.string().url().optional(),
  cvUrl: z.string().url().optional(),
  liveCvEnabled: z.boolean().default(false),
  liveCvVisibility: z.enum(["PUBLIC", "COMMUNITY", "WORKSPACE", "PRIVATE"]).default("PRIVATE")
});

