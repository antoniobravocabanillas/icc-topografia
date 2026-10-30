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
  contributionRole: z.string().trim().max(120).optional(),
  responsibilities: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  methods: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  tools: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
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

export const terraqoWorklogRevisionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(4).max(180),
  summary: z.string().trim().min(20).max(2400),
  outcome: z.string().trim().max(800).optional(),
  contributionRole: z.string().trim().max(120).optional(),
  responsibilities: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  methods: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  tools: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});

export const terraqoWorkCaseCreateSchema = z.object({
  title: z.string().trim().min(4).max(180),
  description: z.string().trim().max(1200).optional(),
  workspaceId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  records: z.array(z.object({
    worklogId: z.string().cuid(),
    phase: z.enum(["PREPARATION", "EXECUTION", "RESULT"]).optional(),
  })).min(1).max(100),
});

export const terraqoWorkCaseRecordSchema = z.object({
  expectedVersion: z.number().int().positive(),
  worklogId: z.string().cuid(),
  phase: z.enum(["PREPARATION", "EXECUTION", "RESULT"]).optional(),
});

export const terraqoShareableEvidenceField = z.enum([
  "title",
  "summary",
  "outcome",
  "contributionRole",
  "responsibilities",
  "methods",
  "tools",
  "occurredAt",
  "locationLabel",
]);

export const terraqoShareCollectionCreateSchema = z.object({
  title: z.string().trim().min(4).max(180),
  description: z.string().trim().max(1200).optional(),
  items: z.array(z.object({
    revisionId: z.string().cuid(),
    allowedFields: z.array(terraqoShareableEvidenceField).min(1),
    includeMedia: z.boolean().default(false),
  })).min(1).max(100),
});

export const terraqoAccessGrantCreateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  subjectUserId: z.string().cuid().optional(),
  inviteEmail: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  scopes: z.array(z.enum(["VIEW_COLLECTION", "DOWNLOAD_MEDIA"])).min(1).max(2),
  expiresAt: z.string().datetime({ offset: true }),
}).superRefine((value, context) => {
  if (Boolean(value.subjectUserId) === Boolean(value.inviteEmail)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subjectUserId"],
      message: "Indica un usuario o un correo, pero no ambos.",
    });
  }
  if (!value.scopes.includes("VIEW_COLLECTION")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scopes"],
      message: "Todo acceso debe incluir lectura de la selección.",
    });
  }
});

export const terraqoPublicProjectionSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const terraqoEndorsementRequestCreateSchema = z.object({
  revisionId: z.string().cuid(),
  reviewerUserId: z.string().cuid().optional(),
  reviewerEmail: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  organizationId: z.string().cuid().optional(),
  relationshipLabel: z.string().trim().min(3).max(120),
  requestedScope: z.array(terraqoShareableEvidenceField).min(1).max(9).superRefine((fields, context) => {
    const seen = new Set<string>();
    fields.forEach((field, index) => {
      if (seen.has(field)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: "Cada aspecto se solicita una sola vez." });
      seen.add(field);
    });
  }),
  expiresAt: z.string().datetime({ offset: true }),
  sendNow: z.boolean().default(false),
}).superRefine((value, context) => {
  if (Boolean(value.reviewerUserId) === Boolean(value.reviewerEmail)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewerUserId"],
      message: "Indica un revisor o un correo, pero no ambos.",
    });
  }
});

export const terraqoEndorsementDecisionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  responses: z.array(z.object({
    field: terraqoShareableEvidenceField,
    decision: z.enum(["CONFIRMED", "UNABLE_TO_CONFIRM", "CHANGES_REQUESTED"]),
    comment: z.string().trim().max(1200).optional(),
  })).min(1).superRefine((responses, context) => {
    const seen = new Set<string>();
    responses.forEach((response, index) => {
      if (seen.has(response.field))
        context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "field"], message: "Cada aspecto se responde una sola vez." });
      seen.add(response.field);
      if (response.decision === "CHANGES_REQUESTED" && !response.comment)
        context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "comment"], message: "Explica qué información debe aclararse." });
    });
  }),
  summaryComment: z.string().trim().max(1200).optional(),
});

const terraqoNeedRequirementSchema = z.object({
  label: z.string().trim().min(2).max(180),
  priority: z.enum(["REQUIRED", "DESIRED"]),
});

const terraqoWorkNeedContentSchema = z.object({
  title: z.string().trim().min(4).max(180),
  problem: z.string().trim().min(20).max(2400),
  activities: z.array(z.string().trim().min(2).max(180)).max(30).default([]),
  context: z.string().trim().max(1600).optional(),
  locationLabel: z.string().trim().max(180).optional(),
  availableFrom: z.string().datetime({ offset: true }).optional(),
  availableUntil: z.string().datetime({ offset: true }).optional(),
  requiredTools: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  endorsementNeeded: z.boolean().default(false),
  requirements: z.array(terraqoNeedRequirementSchema).min(1).max(40),
}).superRefine((value, context) => {
  if (value.availableFrom && value.availableUntil && new Date(value.availableUntil) <= new Date(value.availableFrom)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["availableUntil"],
      message: "La fecha final debe ser posterior a la fecha inicial.",
    });
  }
  const normalized = value.requirements.map((requirement) => requirement.label.toLocaleLowerCase("es-PE"));
  if (new Set(normalized).size !== normalized.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requirements"],
      message: "Cada requisito debe aparecer una sola vez.",
    });
  }
});

export const terraqoWorkNeedCreateSchema = terraqoWorkNeedContentSchema;

export const terraqoWorkNeedRevisionSchema = terraqoWorkNeedContentSchema.and(z.object({
  expectedVersion: z.number().int().positive(),
}));

export const terraqoEvaluationDossierCreateSchema = z.object({
  needRevisionId: z.string().cuid(),
  professionalProfileId: z.string().cuid(),
  worklogRevisionIds: z.array(z.string().cuid()).min(1).max(50),
  privateSummary: z.string().trim().max(2400).optional(),
});

export const terraqoEvaluationAssessmentSchema = z.object({
  requirementId: z.string().cuid().optional(),
  criterionLabel: z.string().trim().min(2).max(180),
  claimState: z.enum(["DOCUMENTED", "DECLARED", "ENDORSED", "CONFIRMED", "UNKNOWN"]),
  rationale: z.string().trim().max(1600).optional(),
  sourceIds: z.array(z.string().cuid()).max(30).default([]),
  expectedRevisionNo: z.number().int().min(0),
}).superRefine((value, context) => {
  if (["DOCUMENTED", "ENDORSED", "CONFIRMED"].includes(value.claimState) && value.sourceIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceIds"],
      message: "Este estado requiere al menos una fuente vigente.",
    });
  }
  if (value.claimState === "UNKNOWN" && !value.rationale) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rationale"],
      message: "Indica qué información falta confirmar.",
    });
  }
});

export const terraqoEvaluationNoteSchema = z.object({
  body: z.string().trim().min(2).max(3000),
});

export const terraqoEvaluationQuestionSchema = z.object({
  questionId: z.string().cuid().optional(),
  text: z.string().trim().min(4).max(1200),
  expectedRevisionNo: z.number().int().min(0),
});

export const terraqoAnalysisPurposeSchema = z.enum([
  "EVIDENCE_SUMMARY",
  "REQUIREMENT_GAPS",
  "QUESTION_DRAFTS",
]);

export const terraqoAnalysisJobCreateSchema = z.object({
  dossierId: z.string().cuid(),
  purpose: terraqoAnalysisPurposeSchema,
  sourceRevisionIds: z.array(z.string().cuid()).min(1).max(30),
  expectedPolicies: z.array(z.object({
    sourceRevisionId: z.string().cuid(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
    accessKind: z.enum(["PUBLIC_CV", "PUBLIC_SELECTION", "PRIVATE_GRANT"]),
  })).min(1).max(30),
}).superRefine((value, context) => {
  const revisionIds = new Set(value.sourceRevisionIds);
  const policyIds = new Set(value.expectedPolicies.map((policy) => policy.sourceRevisionId));
  if (revisionIds.size !== value.sourceRevisionIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceRevisionIds"], message: "No repitas fuentes." });
  }
  if (policyIds.size !== value.expectedPolicies.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedPolicies"], message: "No repitas políticas de fuente." });
  }
  if (revisionIds.size !== policyIds.size || [...revisionIds].some((revisionId) => !policyIds.has(revisionId))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedPolicies"], message: "Confirma la política de cada revisión seleccionada." });
  }
});

export const terraqoConversationRequestCreateSchema = z.object({
  dossierId: z.string().cuid(),
  note: z.string().trim().max(1200).optional(),
});

export const terraqoConversationRequestDecisionSchema = z.object({
  action: z.enum(["ACCEPT", "REJECT", "BLOCK", "REPORT"]),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().max(1200).optional(),
}).superRefine((value, context) => {
  if (["BLOCK", "REPORT"].includes(value.action) && !value.reason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Explica brevemente el motivo." });
  }
});

const terraqoCollaborationProposalFields = z.object({
  scope: z.string().trim().min(12).max(5000),
  roleTitle: z.string().trim().min(2).max(160),
  deliverables: z.array(z.string().trim().min(2).max(300)).min(1).max(30)
    .superRefine((items, context) => {
      const normalized = items.map((item) => item.toLocaleLowerCase("es"));
      if (new Set(normalized).size !== normalized.length)
        context.addIssue({ code: z.ZodIssueCode.custom, message: "No repitas entregables equivalentes." });
    }),
  startsOn: z.string().date().nullable().optional(),
  endsOn: z.string().date().nullable().optional(),
  conditions: z.string().trim().max(3000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.startsOn && value.endsOn && value.endsOn < value.startsOn)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsOn"], message: "La fecha final no puede ser anterior a la inicial." });
});

export const terraqoCollaborationCreateSchema = terraqoCollaborationProposalFields.and(z.object({
  conversationId: z.string().cuid(),
}));

export const terraqoCollaborationRevisionSchema = terraqoCollaborationProposalFields.and(z.object({
  expectedVersion: z.number().int().positive(),
}));

export const terraqoCollaborationDecisionSchema = z.object({
  action: z.enum(["ACCEPT", "REJECT", "REQUEST_CHANGES"]),
  expectedRevisionNo: z.number().int().positive(),
  comment: z.string().trim().max(1200).optional(),
}).superRefine((value, context) => {
  if (value.action !== "ACCEPT" && !value.comment)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["comment"], message: "Explica el rechazo o los cambios solicitados." });
});

export const terraqoClosureDraftSchema = z.object({
  contribution: z.string().trim().min(12).max(5000),
  deliverables: z.array(z.string().trim().min(2).max(300)).min(1).max(30),
  result: z.string().trim().min(4).max(5000),
  authorizedExcerpt: z.string().trim().max(2000).nullable().optional(),
  referenceRevisionIds: z.array(z.string().cuid()).max(30).default([]),
  expectedVersion: z.number().int().positive().nullable().optional(),
}).superRefine((value, context) => {
  if (new Set(value.referenceRevisionIds).size !== value.referenceRevisionIds.length)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["referenceRevisionIds"], message: "No repitas referencias." });
});

export const terraqoClosureSubmitSchema = z.object({
  expectedRevisionNo: z.number().int().positive(),
});

export const terraqoClosureDecisionSchema = z.object({
  action: z.enum(["ACCEPT", "REQUEST_CHANGES", "DECLINE"]),
  expectedRevisionNo: z.number().int().positive(),
  comment: z.string().trim().max(1200).optional(),
}).superRefine((value, context) => {
  if (value.action !== "ACCEPT" && !value.comment)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["comment"], message: "Explica la corrección o el desacuerdo." });
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
  context: z.enum(["PROJECT", "PERSONAL_FIELD"]),
  projectId: z.string().cuid().optional(),
  type: z.enum(["CHECK_IN", "CHECK_OUT"]),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().positive().max(5000),
}).superRefine((value, context) => {
  if (value.context === "PROJECT" && !value.projectId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Selecciona el proyecto de la jornada.", path: ["projectId"] });
  }
  if (value.context === "PERSONAL_FIELD" && value.projectId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "La jornada personal no debe vincularse a un proyecto.", path: ["projectId"] });
  }
});

export const terraqoAttendanceLocationSyncSchema = z.object({
  attendanceId: z.string().cuid(),
  samples: z.array(z.object({
    clientSampleId: z.string().uuid(),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracyMeters: z.number().finite().positive().max(150),
    capturedAt: z.string().datetime({ offset: true }),
  })).min(1).max(100),
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
