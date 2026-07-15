import { z } from "zod";
import { professionalCategories } from "@/lib/terraqo/professional-categories";

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
    "CUSTOMER_CHAT",
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
  professionalCategories: z.array(z.enum(professionalCategories)).default([]),
  specialties: z.array(z.string().min(1)).default([]),
  equipment: z.array(z.string().min(1)).default([]),
  software: z.array(z.string().min(1)).default([]),
  certifications: z.array(z.string().min(1)).default([]),
  portfolioUrl: z.string().url().optional(),
  cvUrl: z.string().url().optional(),
  liveCvEnabled: z.boolean().default(false),
  liveCvVisibility: z.enum(["PUBLIC", "COMMUNITY", "WORKSPACE", "PRIVATE"]).default("PRIVATE")
});

const worklogVisibility = z.enum(["PUBLIC", "COMMUNITY", "WORKSPACE", "PRIVATE"]);

export const terraqoWorklogCreateSchema = z.object({
  workspaceId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  title: z.string().trim().min(4).max(180),
  summary: z.string().trim().min(20).max(2400),
  outcome: z.string().trim().max(800).optional(),
  type: z.enum(["FIELD_UPDATE", "DELIVERABLE", "PROBLEM_SOLVED", "LEARNING", "MILESTONE"]).default("FIELD_UPDATE"),
  visibility: worklogVisibility.default("PRIVATE"),
  skills: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  evidenceUrls: z.array(z.string().url()).max(10).default([]),
  occurredAt: z.coerce.date().optional()
});

export const terraqoWorklogEngagementSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("comment"),
    body: z.string().trim().min(2).max(800)
  }),
  z.object({
    action: z.literal("react"),
    type: z.enum(["USEFUL", "INSIGHTFUL", "RESPECT"])
  })
]);

const optionalUrl = z.union([z.string().url(), z.literal("")]).optional();

export const publicCareerApplicationSchema = z.object({
  jobPostId: z.string().min(1).optional(),
  name: z.string().trim().min(3).max(160),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(7).max(40),
  password: z.string().min(8).max(100),
  category: z.enum(professionalCategories),
  specialty: z.string().trim().min(2).max(180),
  roleTitle: z.string().trim().max(180).optional(),
  city: z.string().trim().min(2).max(120),
  yearsExperience: z.number().int().min(0).max(80),
  currentCompany: z.string().trim().max(180).optional(),
  currentRole: z.string().trim().max(180).optional(),
  portfolioUrl: optionalUrl,
  cvUrl: optionalUrl,
  equipment: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  software: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  coverNote: z.string().trim().min(20).max(3000),
  availabilityNote: z.string().trim().max(600).optional(),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true)
});
