import { z } from "zod";
import { professionalCategories } from "@/lib/terraqo/professional-categories";

export const terraqoWorkspaceCreateSchema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  type: z
    .enum(["CLIENT_COMPANY", "INTERNAL_UNIT", "PRODUCT_ADMIN"])
    .default("CLIENT_COMPANY"),
  industry: z.string().optional(),
  description: z.string().optional(),
  companyId: z.string().optional(),
  ownerUserId: z.string().optional(),
  brandName: z.string().optional(),
  domain: z.string().optional(),
  logoUrl: z.string().optional(),
  plan: z
    .enum(["FREE", "BASIC", "PROFESSIONAL", "PREMIUM", "ENTERPRISE"])
    .default("BASIC"),
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
    "PROFESSIONAL_MESSAGING",
    "TERRAQO_MEET",
    "COLLABORATION_TEAMS",
    "ANALYTICS",
    "AUTOMATIONS",
    "DOCUMENTS",
  ]),
  active: z.boolean(),
  config: z.unknown().optional(),
});

export const terraqoProfessionalProfileSchema = z.object({
  headline: z.string().max(180).optional(),
  bio: z.string().max(1400).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(2).default("PE"),
  status: z
    .enum(["AVAILABLE", "WORKING", "OPEN_TO_PROJECTS", "NOT_AVAILABLE"])
    .default("OPEN_TO_PROJECTS"),
  visibility: z
    .enum(["PUBLIC", "COMMUNITY", "WORKSPACE", "PRIVATE"])
    .default("PRIVATE"),
  yearsExperience: z.number().int().min(0).max(80).optional(),
  professionalCategories: z.array(z.enum(professionalCategories)).default([]),
  specialties: z.array(z.string().min(1)).default([]),
  equipment: z.array(z.string().min(1)).default([]),
  software: z.array(z.string().min(1)).default([]),
  certifications: z.array(z.string().min(1)).default([]),
  portfolioUrl: z.string().url().optional(),
  cvUrl: z.string().url().optional(),
  liveCvEnabled: z.boolean().default(false),
  liveCvVisibility: z
    .enum(["PUBLIC", "COMMUNITY", "WORKSPACE", "PRIVATE"])
    .default("PRIVATE"),
});

const worklogVisibility = z.enum([
  "PUBLIC",
  "COMMUNITY",
  "WORKSPACE",
  "PRIVATE",
]);

export const terraqoWorklogCreateSchema = z.object({
  workspaceId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  previousWorklogId: z.string().cuid().optional(),
  title: z.string().trim().min(4).max(180),
  summary: z.string().trim().min(20).max(2400),
  outcome: z.string().trim().max(800).optional(),
  type: z
    .enum([
      "FIELD_UPDATE",
      "DELIVERABLE",
      "PROBLEM_SOLVED",
      "LEARNING",
      "MILESTONE",
    ])
    .default("FIELD_UPDATE"),
  visibility: worklogVisibility.default("PRIVATE"),
  skills: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  evidenceUrls: z.array(z.string().url()).max(10).default([]),
  locationLabel: z.string().trim().max(180).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  locationAccuracyMeters: z.number().finite().positive().max(10000).optional(),
  locationCapturedAt: z.coerce.date().optional(),
}).superRefine((value, context) => {
  const coordinates = [value.latitude, value.longitude];
  if (coordinates.some((item) => item !== undefined) && coordinates.some((item) => item === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "La ubicación debe incluir latitud y longitud.", path: ["latitude"] });
  }
});

export const terraqoWorklogContinuitySchema = z.object({
  worklogId: z.string().cuid(),
  previousWorklogId: z.string().cuid().nullable(),
});

export const terraqoWorklogValidationRequestSchema = z.object({
  validatorUserId: z.string().cuid(),
  note: z.string().trim().max(500).optional(),
});

export const terraqoAttendanceOptionsSchema = z.object({
  projectId: z.string().cuid(),
  type: z.enum(["CHECK_IN", "CHECK_OUT"]),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().positive().max(5000),
});

export const terraqoWorklogEngagementSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("comment"),
    body: z.string().trim().min(2).max(800),
  }),
  z.object({
    action: z.literal("react"),
    type: z.enum(["USEFUL", "INSIGHTFUL", "RESPECT"]),
  }),
]);

export const terraqoForumPostCreateSchema = z.object({
  channelId: z.string().cuid(),
  title: z.string().trim().min(8).max(180),
  body: z.string().trim().min(30).max(6000),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
});

export const terraqoForumReplyCreateSchema = z.object({
  postId: z.string().cuid(),
  body: z.string().trim().min(4).max(3000),
});

export const terraqoTeamCreateSchema = z.object({
  workspaceId: z.string().cuid(),
  name: z.string().trim().min(3).max(120),
  purpose: z.string().trim().min(20).max(1200),
  projectId: z.string().cuid().optional(),
  memberUserIds: z.array(z.string().cuid()).min(1).max(12),
});

export const terraqoTeamInvitationSchema = z.object({
  teamId: z.string().cuid(),
  action: z.enum(["accept", "decline"]),
});

const optionalUrl = z.union([z.string().url(), z.literal("")]).optional();
const customCareerAnswer = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const publicCareerApplicationSchema = z.object({
  jobPostId: z.string().min(1).optional(),
  formConfigVersion: z.string().trim().max(120).optional(),
  name: z.string().trim().min(3).max(160),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
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
  customAnswers: z.record(customCareerAnswer).default({}),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
});
