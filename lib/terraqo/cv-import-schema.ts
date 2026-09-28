import { z } from "zod";

const optionalText = z.string().trim().max(2000).nullable().optional();
const optionalDate = z.string().regex(/^\d{4}(?:-\d{2})?(?:-\d{2})?$/).nullable().optional();

export const cvProfileSchema = z.object({
  headline: z.string().trim().max(180).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().length(2).nullable().optional(),
  professionalCategories: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  specialties: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  equipment: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  software: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  certifications: z.array(z.string().trim().min(1).max(140)).max(40).default([]),
}).strict();
export const cvExperienceSchema = z.object({
  title: z.string().trim().min(1).max(180),
  companyName: z.string().trim().max(180).nullable().optional(),
  role: z.string().trim().max(180).nullable().optional(),
  summary: optionalText,
  highlights: z.array(z.string().trim().min(1).max(400)).max(12).default([]),
  location: z.string().trim().max(180).nullable().optional(),
  country: z.string().trim().length(2).nullable().optional(),
  locationCity: z.string().trim().max(120).nullable().optional(),
  startedAt: optionalDate,
  endedAt: optionalDate,
  currentlyWorking: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0),
  sourcePage: z.number().int().positive().nullable().optional(),
  sourceText: z.string().trim().max(1200).nullable().optional(),
}).strict();

export const cvEducationSchema = z.object({
  institution: z.string().trim().min(1).max(180),
  degree: z.string().trim().min(1).max(180),
  field: z.string().trim().max(180).nullable().optional(),
  country: z.string().trim().length(2).nullable().optional(),
  locationCity: z.string().trim().max(120).nullable().optional(),
  startedAt: optionalDate,
  endedAt: optionalDate,
  currentlyStudying: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0),
  sourcePage: z.number().int().positive().nullable().optional(),
  sourceText: z.string().trim().max(1200).nullable().optional(),
}).strict();

export const cvExtractionSchema = z.object({
  profile: cvProfileSchema.default({}),
  experiences: z.array(cvExperienceSchema).max(80).default([]),
  education: z.array(cvEducationSchema).max(60).default([]),
  warnings: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
}).strict();

export type CvExtraction = z.infer<typeof cvExtractionSchema>;

export const cvImportStartSchema = z.object({
  documentId: z.string().cuid(),
  consentForTraining: z.boolean().default(false),
}).strict();

export const cvImportReviewSchema = z.object({
  consentForTraining: z.boolean().optional(),
  items: z.array(z.object({
    id: z.string().cuid(),
    decision: z.enum(["ACCEPTED", "REJECTED"]),
    normalizedData: z.record(z.unknown()),
  }).strict()).min(1).max(180),
}).strict();
