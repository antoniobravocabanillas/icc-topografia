import type { TerraqoModuleCode, TerraqoPlanTier } from "@prisma/client";

export const workspace = {
  name: "Terraqo Workspace",
  currentPanel: "Panel ICC Topografia",
  currentUnit: "ICC Topografia",
  defaultWorkspaceSlug: "icc-topografia",
  description: "Operacion comercial, tecnica, tienda, proyectos, evidencias y postventa.",
  futurePanels: ["Panel ICC GROUP", "Panel Terraqo Producto/Admin"]
};

export type TerraqoModuleDefinition = {
  code: TerraqoModuleCode;
  label: string;
  description: string;
  minimumTier: TerraqoPlanTier;
};

export const terraqoModules: TerraqoModuleDefinition[] = [
  {
    code: "CRM",
    label: "CRM comercial",
    description: "Leads, clientes, oportunidades, cotizaciones, ventas y seguimiento comercial.",
    minimumTier: "BASIC"
  },
  {
    code: "PROJECTS",
    label: "Gestion de proyectos",
    description: "Proyectos, hitos, tareas, evidencias, documentos y entregables.",
    minimumTier: "BASIC"
  },
  {
    code: "PUBLIC_WEBSITE",
    label: "Sitio publico conectado",
    description: "Servicios, casos, tienda y formularios alimentados desde el workspace.",
    minimumTier: "PROFESSIONAL"
  },
  {
    code: "TECHNICAL_STORE",
    label: "Tienda tecnica",
    description: "Catalogo, cotizaciones, venta, alquiler, soporte y postventa.",
    minimumTier: "PROFESSIONAL"
  },
  {
    code: "CUSTOMER_CHAT",
    label: "Chat comercial y soporte",
    description: "Widget web, chatbot, conversaciones asignables y trazabilidad de atencion al cliente.",
    minimumTier: "PROFESSIONAL"
  },
  {
    code: "PROFESSIONAL_NETWORK",
    label: "Red profesional",
    description: "Perfiles, disponibilidad, reputacion, comunidades y relacion profesional.",
    minimumTier: "PREMIUM"
  },
  {
    code: "LIVE_CV",
    label: "CV vivo validado",
    description: "Experiencia alimentada por proyectos reales y validacion Terraqo.",
    minimumTier: "PREMIUM"
  },
  {
    code: "JOB_MARKETPLACE",
    label: "Marketplace laboral",
    description: "Convocatorias, postulaciones privadas y seleccion de profesionales.",
    minimumTier: "PREMIUM"
  },
  {
    code: "FORUMS",
    label: "Foros y comunidad",
    description: "Conversaciones tecnicas, consultas, actualizaciones y comunidad por rubro.",
    minimumTier: "PREMIUM"
  },
  {
    code: "PROFESSIONAL_MESSAGING",
    label: "Mensajeria profesional",
    description: "Conversaciones directas entre profesionales, empresas y equipos vinculados a proyectos.",
    minimumTier: "PREMIUM"
  },
  {
    code: "TERRAQO_MEET",
    label: "Terraqo Meet",
    description: "Videollamadas privadas entre participantes autorizados de conversaciones y proyectos.",
    minimumTier: "PREMIUM"
  },
  {
    code: "COLLABORATION_TEAMS",
    label: "Equipos Terraqo",
    description: "Duplas y squads privados con invitaciones, mensajeria grupal y reuniones integradas.",
    minimumTier: "PREMIUM"
  },
  {
    code: "ANALYTICS",
    label: "Analitica ejecutiva",
    description: "Indicadores de conversion, operacion, proyectos, talento y uso del producto.",
    minimumTier: "ENTERPRISE"
  },
  {
    code: "AUTOMATIONS",
    label: "Automatizaciones",
    description: "Alertas, asignaciones, flujos CRM, emails y operaciones conectadas.",
    minimumTier: "ENTERPRISE"
  },
  {
    code: "DOCUMENTS",
    label: "Documentos y data room",
    description: "Control documental, permisos, entregables y repositorio privado.",
    minimumTier: "PROFESSIONAL"
  },
  {
    code: "AI_WRITING_ASSISTANT",
    label: "Asistente de escritura con IA",
    description: "Corrección contextual de ortografía, gramática, sintaxis y claridad en los campos de redacción del workspace.",
    minimumTier: "PROFESSIONAL"
  }
];

export function getDefaultModulesForTier(tier: TerraqoPlanTier): TerraqoModuleCode[] {
  const rank: Record<TerraqoPlanTier, number> = {
    FREE: 0,
    BASIC: 1,
    PROFESSIONAL: 2,
    PREMIUM: 3,
    ENTERPRISE: 4
  };

  return terraqoModules
    .filter((module) => rank[module.minimumTier] <= rank[tier])
    .map((module) => module.code);
}
