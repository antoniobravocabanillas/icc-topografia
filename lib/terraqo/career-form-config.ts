import type { TerraqoWorkspace } from "@prisma/client";
import { professionalCategories } from "@/lib/terraqo/professional-categories";

export type CareerFieldType =
  | "text"
  | "email"
  | "phone"
  | "password"
  | "number"
  | "url"
  | "textarea"
  | "select"
  | "multiSelect"
  | "file"
  | "checkbox";

export type CareerOptionSource = "professionalCategories" | "equipmentByCategory" | "softwareByCategory";

export type CareerFieldConfig = {
  key: string;
  label: string;
  type: CareerFieldType;
  mapsTo?: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  enabled?: boolean;
  width?: "half" | "full";
  maxLength?: number;
  min?: number;
  max?: number;
  options?: string[];
  optionsSource?: CareerOptionSource;
};

export type CareerFormSectionConfig = {
  id: string;
  title: string;
  description?: string;
  fields: CareerFieldConfig[];
};

export type CareerDocumentRequirement = {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
};

export type CareerFormConfig = {
  version: string;
  headline: string;
  subheadline: string;
  intro: string;
  submitLabel: string;
  privacyNote: string;
  primaryColor?: string;
  sections: CareerFormSectionConfig[];
  documentRequirements: CareerDocumentRequirement[];
};

type WorkspaceConfigCarrier = Pick<TerraqoWorkspace, "slug" | "name" | "brandName">;

const baseSections: CareerFormSectionConfig[] = [
  {
    id: "identity",
    title: "Datos de acceso y contacto",
    description: "Esta información crea tu cuenta privada en Portal Terraqo para dar seguimiento a tu postulación.",
    fields: [
      { key: "name", mapsTo: "name", label: "Nombre completo", type: "text", required: true, width: "half", placeholder: "Ej. Yamila Denis" },
      { key: "email", mapsTo: "email", label: "Correo electrónico", type: "email", required: true, width: "half", placeholder: "tu correo principal" },
      { key: "phone", mapsTo: "phone", label: "Teléfono / WhatsApp", type: "phone", required: true, width: "half", placeholder: "+51 ..." },
      { key: "password", mapsTo: "password", label: "Contraseña para seguimiento", type: "password", required: true, width: "half", placeholder: "Mínimo 8 caracteres" }
    ]
  },
  {
    id: "professional",
    title: "Perfil profesional",
    description: "Cuéntanos en qué área trabajas y qué tipo de proyectos puedes atender.",
    fields: [
      { key: "category", mapsTo: "category", label: "Categoría profesional", type: "select", required: true, width: "half", optionsSource: "professionalCategories" },
      { key: "specialty", mapsTo: "specialty", label: "Especialidad", type: "text", required: true, width: "half", placeholder: "Ej. Topografía de obra, drones, CAD, seguridad..." },
      { key: "roleTitle", mapsTo: "roleTitle", label: "Cargo o perfil que postulas", type: "text", width: "half", placeholder: "Ej. Auxiliar de topografía" },
      { key: "city", mapsTo: "city", label: "Ciudad", type: "text", required: true, width: "half", placeholder: "Ej. Lima" },
      { key: "yearsExperience", mapsTo: "yearsExperience", label: "Años de experiencia", type: "number", required: true, width: "half", min: 0, max: 80 },
      { key: "currentCompany", mapsTo: "currentCompany", label: "Empresa actual o última empresa", type: "text", width: "half", placeholder: "Opcional" },
      { key: "currentRole", mapsTo: "currentRole", label: "Cargo actual o último cargo", type: "text", width: "half", placeholder: "Opcional" }
    ]
  },
  {
    id: "tools",
    title: "Herramientas que manejas",
    description: "Las opciones cambian según la categoría elegida. Esto ayuda a filtrar oportunidades sin pedir información de más.",
    fields: [
      { key: "equipment", mapsTo: "equipment", label: "Equipos que manejas", type: "multiSelect", width: "full", optionsSource: "equipmentByCategory" },
      { key: "software", mapsTo: "software", label: "Software que utilizas", type: "multiSelect", width: "full", optionsSource: "softwareByCategory" }
    ]
  },
  {
    id: "evidence",
    title: "Evidencia y disponibilidad",
    description: "Tu CV y presentación quedan vinculados a tu perfil privado. Luego podrás validar documentos, experiencias y proyectos.",
    fields: [
      { key: "portfolioUrl", mapsTo: "portfolioUrl", label: "Portafolio o perfil profesional", type: "url", width: "half", placeholder: "https://..." },
      { key: "cvUrl", mapsTo: "cvUrl", label: "Enlace a CV", type: "url", width: "half", placeholder: "Opcional si subirás archivo" },
      { key: "cvFile", label: "Archivo CV", type: "file", width: "full", helpText: "PDF, DOC o DOCX. Máximo 10 MB." },
      { key: "coverNote", mapsTo: "coverNote", label: "Presentación profesional", type: "textarea", required: true, width: "full", placeholder: "Describe tu experiencia, fortalezas y tipo de proyectos donde puedes aportar." },
      { key: "availabilityNote", mapsTo: "availabilityNote", label: "Disponibilidad", type: "textarea", width: "full", placeholder: "Disponibilidad, modalidad, fecha desde la que puedes incorporarte o zonas donde trabajas." }
    ]
  }
];

export const defaultCareerFormConfig: CareerFormConfig = {
  version: "career-form-v1",
  headline: "Postula y crea tu perfil profesional en Terraqo",
  subheadline: "Bolsa de talento conectada al workspace",
  intro:
    "Completa tu información una sola vez. La empresa revisa tu postulación y tu perfil queda listo para CV vivo, validaciones y futuras oportunidades.",
  submitLabel: "Crear perfil y postular",
  privacyNote:
    "Tu perfil inicia como privado. Tus datos, documentos y experiencia solo se mostrarán con permisos y validaciones del workspace correspondiente.",
  sections: baseSections,
  documentRequirements: [
    { key: "cv", label: "CV profesional", required: true },
    { key: "dni", label: "DNI por ambos lados", description: "Se solicita después del registro para validar identidad." },
    { key: "certiadulto", label: "Certiadulto" },
    { key: "sctr", label: "SCTR", description: "Puede ser requerido según proyecto o empresa." }
  ]
};

const iccTopografiaCareerFormConfig: CareerFormConfig = {
  ...defaultCareerFormConfig,
  version: "icc-topografia-career-form-v1",
  headline: "Trabaja con ICC Topografía",
  subheadline: "Red profesional Terraqo para proyectos técnicos",
  intro:
    "Registra tu perfil para participar en proyectos topográficos, soporte de campo, gabinete, drones, geodesia, control de obra y actividades técnicas vinculadas a ICC Topografía.",
  documentRequirements: [
    { key: "cv", label: "CV profesional", required: true },
    { key: "dni", label: "DNI por ambos lados", required: true },
    { key: "certiadulto", label: "Certiadulto" },
    { key: "antecedentesPenales", label: "Antecedentes penales" },
    { key: "antecedentesPoliciales", label: "Antecedentes policiales" },
    { key: "sctr", label: "SCTR" }
  ]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeField(field: unknown): CareerFieldConfig | null {
  if (!isRecord(field) || typeof field.key !== "string" || typeof field.label !== "string" || typeof field.type !== "string") return null;
  const type = field.type as CareerFieldType;
  const validTypes: CareerFieldType[] = ["text", "email", "phone", "password", "number", "url", "textarea", "select", "multiSelect", "file", "checkbox"];
  if (!validTypes.includes(type)) return null;
  return {
    key: field.key,
    label: field.label,
    type,
    mapsTo: typeof field.mapsTo === "string" ? field.mapsTo : undefined,
    placeholder: typeof field.placeholder === "string" ? field.placeholder : undefined,
    helpText: typeof field.helpText === "string" ? field.helpText : undefined,
    required: typeof field.required === "boolean" ? field.required : undefined,
    enabled: typeof field.enabled === "boolean" ? field.enabled : undefined,
    width: field.width === "half" || field.width === "full" ? field.width : undefined,
    maxLength: typeof field.maxLength === "number" ? field.maxLength : undefined,
    min: typeof field.min === "number" ? field.min : undefined,
    max: typeof field.max === "number" ? field.max : undefined,
    options: Array.isArray(field.options) ? field.options.filter((item): item is string => typeof item === "string") : undefined,
    optionsSource:
      field.optionsSource === "professionalCategories" || field.optionsSource === "equipmentByCategory" || field.optionsSource === "softwareByCategory"
        ? field.optionsSource
        : undefined
  };
}

function normalizeExternalConfig(raw: unknown): Partial<CareerFormConfig> | null {
  if (!isRecord(raw)) return null;
  const candidate = isRecord(raw.careerForm) ? raw.careerForm : raw;
  if (!isRecord(candidate)) return null;

  const sections: CareerFormSectionConfig[] | undefined = Array.isArray(candidate.sections)
    ? candidate.sections.reduce<CareerFormSectionConfig[]>((items, section) => {
          if (!isRecord(section) || typeof section.id !== "string" || typeof section.title !== "string" || !Array.isArray(section.fields)) return items;
          const fields = section.fields.map(normalizeField).filter((field): field is CareerFieldConfig => Boolean(field));
          if (!fields.length) return items;
          items.push({
            id: section.id,
            title: section.title,
            description: typeof section.description === "string" ? section.description : undefined,
            fields
          });
          return items;
        }, [])
    : undefined;

  const documentRequirements: CareerDocumentRequirement[] | undefined = Array.isArray(candidate.documentRequirements)
    ? candidate.documentRequirements.reduce<CareerDocumentRequirement[]>((items, document) => {
          if (!isRecord(document) || typeof document.key !== "string" || typeof document.label !== "string") return items;
          items.push({
            key: document.key,
            label: document.label,
            description: typeof document.description === "string" ? document.description : undefined,
            required: typeof document.required === "boolean" ? document.required : undefined
          });
          return items;
        }, [])
    : undefined;

  return {
    version: typeof candidate.version === "string" ? candidate.version : undefined,
    headline: typeof candidate.headline === "string" ? candidate.headline : undefined,
    subheadline: typeof candidate.subheadline === "string" ? candidate.subheadline : undefined,
    intro: typeof candidate.intro === "string" ? candidate.intro : undefined,
    submitLabel: typeof candidate.submitLabel === "string" ? candidate.submitLabel : undefined,
    privacyNote: typeof candidate.privacyNote === "string" ? candidate.privacyNote : undefined,
    primaryColor: typeof candidate.primaryColor === "string" ? candidate.primaryColor : undefined,
    sections,
    documentRequirements
  };
}

export function resolveCareerFormConfig(workspace: WorkspaceConfigCarrier, moduleConfig?: unknown): CareerFormConfig {
  const base = workspace.slug === "icc-topografia" ? iccTopografiaCareerFormConfig : defaultCareerFormConfig;
  const external = normalizeExternalConfig(moduleConfig);
  if (!external) return base;

  return {
    ...base,
    ...external,
    sections: external.sections?.length ? external.sections : base.sections,
    documentRequirements: external.documentRequirements?.length ? external.documentRequirements : base.documentRequirements
  };
}

export function getDefaultCareerValues() {
  return {
    category: professionalCategories[0],
    equipment: [] as string[],
    software: [] as string[]
  };
}
