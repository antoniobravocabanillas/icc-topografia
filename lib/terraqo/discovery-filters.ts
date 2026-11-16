import { z } from "zod";

const text = z.string().trim().max(180).optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const instant = new Date(value + "T00:00:00Z");
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}, "Fecha inválida.").optional();

export const discoveryFiltersSchema = z.object({
  activity: text,
  context: text,
  availability: z.enum(["AVAILABLE", "OPEN_TO_PROJECTS", "WORKING", "NOT_AVAILABLE"]).optional(),
  from: day,
  to: day,
}).refine(filters => !filters.from || !filters.to || filters.from <= filters.to, "Revisa el intervalo de fechas.");

export type DiscoveryFilters = z.infer<typeof discoveryFiltersSchema>;

function terms(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function includesTerms(query: string | undefined, fields: (string | null | undefined)[]) {
  if (!query) return true;
  const words = new Set(terms(fields.filter(Boolean).join(" ")));
  const wanted = terms(query);
  return wanted.length > 0 && wanted.every(word => words.has(word));
}

const limaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
});

export function matchesDiscoveryFilters(filters: DiscoveryFilters, evidence: {
  title: string; summary: string; outcome: string | null; responsibilities: string[]; skills: string[];
  methods: string[]; tools: string[]; locationLabel: string | null;
}, availability: string | null, date?: Date) {
  if (filters.availability && filters.availability !== availability) return false;
  if (filters.from || filters.to) {
    if (!date) return false;
    const when = limaDay.format(date);
    if ((filters.from && when < filters.from) || (filters.to && when > filters.to)) return false;
  }
  return includesTerms(filters.activity, [evidence.title, evidence.summary, ...evidence.responsibilities, ...evidence.skills, ...evidence.methods, ...evidence.tools])
    && includesTerms(filters.context, [evidence.title, evidence.summary, evidence.outcome, evidence.locationLabel, ...evidence.methods, ...evidence.responsibilities]);
}
