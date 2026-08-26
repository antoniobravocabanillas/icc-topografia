import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  phone: z.string().trim().optional(),
  company: z.string().trim().optional(),
  message: z.string().trim().min(10),
  intent: z.string().trim().optional(),
  context: z.string().trim().optional(),
  subject: z.string().trim().optional()
});

export const leadSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  phone: z.string().trim().optional(),
  company: z.string().trim().optional(),
  message: z.string().trim().min(10),
  intent: z.string().trim().optional(),
  context: z.string().trim().optional(),
  subject: z.string().trim().optional()
});

export const leadStatusSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"])
});

export const registerSchema = z.object({
  accountType: z.enum(["client", "professional"]).default("client"),
  name: z.string().trim().min(2),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  company: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  document: z.string().trim().optional(),
  identityType: z.string().trim().min(2).max(40),
  identityTypeOther: z.string().trim().max(60).optional(),
  phone: z.string().trim().optional(),
  roleTitle: z.string().trim().optional(),
  specialty: z.string().trim().optional(),
  country: z.string().trim().length(2).default("PE"),
  subdivision: z.string().trim().optional(),
  city: z.string().trim().optional(),
  yearsExperience: z.coerce.number().int().min(0).max(80).optional(),
  equipment: z.string().trim().optional(),
  software: z.string().trim().optional(),
  portfolioUrl: z.string().trim().url().optional().or(z.literal(""))
}).superRefine((value, ctx) => {
  if (value.accountType === "client" && !value.company?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["company"],
      message: "La empresa es obligatoria para cuentas de cliente."
    });
  }
  if (value.accountType === "client" && !value.industry?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["industry"], message: "Selecciona el rubro de la empresa." });
  }
  if (!value.document?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["document"], message: "El número de identificación es obligatorio." });
  }
  if (value.accountType === "client" && !/^\d{11}$/.test(value.document || "")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["document"], message: "El RUC debe contener 11 dígitos." });
  }
  if (value.accountType === "professional" && value.identityType === "OTHER" && !value.identityTypeOther?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["identityTypeOther"], message: "Especifica el tipo de identificación." });
  }
  if (value.accountType === "professional" && !value.roleTitle?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["roleTitle"], message: "Indica tu profesión o perfil." });
  }
});
