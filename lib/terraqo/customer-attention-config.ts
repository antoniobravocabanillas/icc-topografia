import { z } from "zod";
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const attentionConfigSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  greeting: z.string().trim().min(8).max(400),
  topics: z.array(z.string().trim().min(2).max(80)).min(1).max(8),
  domains: z.array(z.string().trim().toLowerCase().regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)).max(10),
  timezone: z.string().max(80).refine(v => { try { new Intl.DateTimeFormat("es", { timeZone: v }); return true; } catch { return false; } }),
  workingDays: z.array(z.number().int().min(0).max(6)).max(7),
  opensAt: time, closesAt: time,
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  offlineMessage: z.string().trim().min(8).max(300),
  installation: z.object({
    position: z.enum(["left", "right"]).default("right"),
    label: z.string().trim().min(2).max(40).default("Habla con nosotros"),
    pages: z.array(z.string().trim().max(200).regex(/^\/(?!\/)[^?#\\\s]*$/)).max(20).default([]),
  }).strict().default({ position: "right", label: "Habla con nosotros", pages: [] }),
  privacyNotice: z.string().trim().min(15).max(500),
}).strict().refine(v => v.opensAt < v.closesAt, { message: "La hora de cierre debe ser posterior a la apertura." });
export type AttentionConfig = z.infer<typeof attentionConfigSchema>;
export type AttentionObjective = "sales" | "support" | "appointments";
const objectiveCopy: Record<AttentionObjective, Pick<AttentionConfig, "greeting" | "topics">> = {
 sales: { greeting: "Hola. Cuéntanos qué buscas y te ayudaremos a encontrar la opción adecuada.", topics: ["Solicitar cotización", "Consultar un producto", "Contratar un servicio", "Otra consulta"] },
 support: { greeting: "Hola. Cuéntanos qué necesitas resolver y nuestro equipo revisará tu consulta.", topics: ["Soporte técnico", "Estado de mi solicitud", "Garantía o mantenimiento", "Otra consulta"] },
 appointments: { greeting: "Hola. Cuéntanos qué atención necesitas y qué horario prefieres. Nuestro equipo confirmará la disponibilidad.", topics: ["Solicitar una cita", "Cambiar una cita", "Consultar disponibilidad", "Otra consulta"] },
};
/** A starting point for copy only: never enables channels, payments or calendar integrations. */
export function attentionObjectiveDraft(config: AttentionConfig, objective: AttentionObjective): AttentionConfig {
 const copy = objectiveCopy[objective];
 return { ...config, greeting: copy.greeting, topics: [...copy.topics] };
}
export const attentionConfigStateSchema = z.object({ version: z.literal(1), revision: z.number().int().nonnegative(), draft: attentionConfigSchema, published: attentionConfigSchema.nullable(), previous: attentionConfigSchema.nullable(), publishedAt: z.string().datetime().nullable() });
export type AttentionConfigState = z.infer<typeof attentionConfigStateSchema>;
export function defaultAttentionConfig(name: string): AttentionConfig {
 return { installation: { position: "right", label: "Habla con nosotros", pages: [] }, displayName: name.slice(0, 100), greeting: "Hola. Cuéntanos qué necesitas y nuestro equipo te ayudará.", topics: ["Ventas", "Servicios", "Soporte", "Otra consulta"], domains: [], timezone: "America/Lima", workingDays: [1, 2, 3, 4, 5], opensAt: "08:00", closesAt: "18:00", accent: "#006b63", offlineMessage: "En este momento estamos fuera de horario. Puedes dejar tu consulta y volver para revisar la respuesta.", privacyNotice: "Usamos los datos que compartes para atender esta consulta. Dejar un medio de contacto no implica aceptar comunicaciones publicitarias." };
}
export function attentionState(settings: unknown, name: string): AttentionConfigState {
 const raw = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>).customerAttention : undefined;
 const state = attentionConfigStateSchema.safeParse(raw);
 if (raw !== undefined && !state.success) throw new Error("Configuración de atención incompatible. Requiere revisión.");
 return state.success ? state.data : { version: 1, revision: 0, draft: defaultAttentionConfig(name), published: null, previous: null, publishedAt: null };
}
export function attentionAvailability(config: AttentionConfig, now = new Date()) {
 const parts = new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
 const get = (type: string) => parts.find(p => p.type === type)?.value || "";
 const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
 const current = `${get("hour")}:${get("minute")}`;
 return config.workingDays.includes(day) && current >= config.opensAt && current < config.closesAt;
}
/** Choose legible text for the configured accent, rather than trusting a brand hex. */
export function attentionAccentText(hex: string) {
 const rgb = hex.slice(1).match(/.{2}/g)!.map(c => parseInt(c,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
 const luminance = rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 return (luminance+.05)/.05 > 1.05/(luminance+.05) ? "#000000" : "#ffffff";
}
