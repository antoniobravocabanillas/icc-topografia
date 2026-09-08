export type BillingAudience = "PERSONAL" | "WORKSPACE";
export type BillingCycle = "MONTHLY" | "ANNUAL";
export type BillingMode = "test" | "live";
export const CATALOG_VERSION = "2026-09-v1";
export const BILLING_TERMS_VERSION = "2026-09-v1";
// Verified merchant API limit. Do not split a subscription into several charges to bypass it.
export const CULQI_MAX_PLAN_MINOR = 500000;
export function supportsBillingCycle(plan: BillingPlan, cycle: BillingCycle) {
  return planAmount(plan, cycle) <= CULQI_MAX_PLAN_MINOR;
}
export type BillingTier = "FREE" | "BASIC" | "PROFESSIONAL" | "PREMIUM" | "ENTERPRISE";
export type BillingPlan = {
  code: string; name: string; audience: BillingAudience; tier: BillingTier;
  monthlyMinor: number; annualMinor: number; seats: number; storageMb: number;
  aiActions: number; automationRuns: number; description: string;
};

// PEN minor units only: no floating-point arithmetic in a payment contract.
// Annual access is prepaid at ten monthly installments (16.67% below twelve).
export const BILLING_PLANS: readonly BillingPlan[] = [
  {code:"personal-free",name:"Gratis",audience:"PERSONAL",tier:"FREE",monthlyMinor:0,annualMinor:0,seats:1,storageMb:250,aiActions:10,automationRuns:0,description:"Tu identidad, experiencia y conexiones, sin tarjeta ni empresa vinculada."},
  {code:"personal-pro",name:"Profesional",audience:"PERSONAL",tier:"PROFESSIONAL",monthlyMinor:2900,annualMinor:29000,seats:1,storageMb:2000,aiActions:100,automationRuns:0,description:"Más espacio para documentar tu trayectoria y asistencia para redactarla."},
  {code:"personal-premium",name:"Profesional Plus",audience:"PERSONAL",tier:"PREMIUM",monthlyMinor:5900,annualMinor:59000,seats:1,storageMb:5000,aiActions:300,automationRuns:0,description:"Mayor capacidad documental y de asistencia para una trayectoria activa."},
  {code:"workspace-free",name:"Empresa Gratis",audience:"WORKSPACE",tier:"FREE",monthlyMinor:0,annualMinor:0,seats:1,storageMb:250,aiActions:10,automationRuns:0,description:"Crea la identidad de tu empresa y explora Terraqo sin tarjeta."},
  {code:"workspace-lite",name:"Lite",audience:"WORKSPACE",tier:"BASIC",monthlyMinor:19900,annualMinor:199000,seats:3,storageMb:10000,aiActions:200,automationRuns:0,description:"CRM y proyectos para un equipo pequeño, en su propio workspace."},
  {code:"workspace-pro",name:"Professional",audience:"WORKSPACE",tier:"PROFESSIONAL",monthlyMinor:39900,annualMinor:399000,seats:10,storageMb:25000,aiActions:800,automationRuns:0,description:"Documentos y operación comercial conectados, con mayor capacidad de trabajo."},
  {code:"workspace-premium",name:"Premium",audience:"WORKSPACE",tier:"PREMIUM",monthlyMinor:79900,annualMinor:799000,seats:25,storageMb:50000,aiActions:2000,automationRuns:0,description:"Colaboración, talento y comunicación para equipos en crecimiento."},
  {code:"workspace-enterprise",name:"Enterprise",audience:"WORKSPACE",tier:"ENTERPRISE",monthlyMinor:159900,annualMinor:1599000,seats:50,storageMb:100000,aiActions:4000,automationRuns:0,description:"Capacidad ampliada y analítica para una operación de mayor escala."},
];
export function getBillingPlan(code: string): BillingPlan {
  const plan = BILLING_PLANS.find(plan => plan.code === code);
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  return plan;
}
export function planAmount(plan: BillingPlan, cycle: BillingCycle) {
  return cycle === "ANNUAL" ? plan.annualMinor : plan.monthlyMinor;
}
export function money(minor: number) {
  return new Intl.NumberFormat("es-PE", { style:"currency", currency:"PEN", maximumFractionDigits:2 }).format(minor / 100);
}
export function periodEnd(start: Date, cycle: BillingCycle): Date {
  const result = new Date(start);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + (cycle === "ANNUAL" ? 12 : 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth()+1,0)).getUTCDate();
  result.setUTCDate(Math.min(day,lastDay));
  return result;
}
