import { NextResponse } from "next/server";
import type { PublicCvProfile } from "@/lib/terraqo/public-cv";
import { publicCvProfileInclude } from "@/lib/terraqo/public-cv";
import { prisma } from "@/lib/prisma";

type CvPdfRouteProps = {
  params: Promise<{ username: string }>;
};

type ProjectSnapshot = {
  id: string;
  title: string;
  clientName: string | null;
  location: string | null;
  category: string | null;
  status: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  AVAILABLE: "Disponible ahora",
  WORKING: "Trabajando",
  OPEN_TO_PROJECTS: "Disponible para proyectos",
  NOT_AVAILABLE: "No disponible"
};

const evidenceLabels: Record<string, string> = {
  DECLARED: "Declarado por el profesional",
  LINKED: "Vinculado a proyecto",
  CONFIRMED: "Confirmado por la empresa",
  VERIFIED: "Verificado por Terraqo"
};

const documentLabels: Record<string, string> = {
  CV: "CV profesional",
  DNI_FRONT: "DNI",
  DNI_BACK: "DNI reverso",
  SCTR: "SCTR",
  CERTIFICATE: "Certiadulto",
  PROFESSIONAL_LICENSE: "Licencia profesional",
  CRIMINAL_RECORD: "Antecedentes",
  MEDICAL_EXAM: "Examen medico",
  BANK_CERTIFICATE: "Constancia bancaria",
  OTHER: "Otros documentos"
};

export async function GET(_request: Request, { params }: CvPdfRouteProps) {
  const { username } = await params;
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { username },
    include: publicCvProfileInclude
  });

  if (!profile) {
    return NextResponse.json({ error: "CV no encontrado" }, { status: 404 });
  }

  const pdf = createCvPdf(buildCvLines(profile), profile.username || username);

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="terraqo-cv-${profile.username || username}.pdf"`,
      "Cache-Control": "no-store"
    }
  });
}

function buildCvLines(profile: PublicCvProfile) {
  const name = profile.user.name || profile.username || "Profesional Terraqo";
  const username = profile.username || "perfil";
  const projects = uniqueProjects(profile);
  const verifiedDocuments = profile.documents.filter((document) => document.reviewStatus === "VERIFIED").length;
  const validatedExperiences = profile.experiences.filter((experience) => experience.verifiedByTerraqo).length;
  const publicEvidence = profile.worklogs.reduce((total, worklog) => total + 1 + worklog.evidenceUrls.length + worklog.media.length, 0);

  return [
    "TERRAQO CV VIVO",
    "Documento profesional generado desde evidencia publica y validaciones autorizadas.",
    "",
    name,
    profile.headline || "Perfil profesional",
    `Usuario publico: terraqoglobal.com/cv/${username}`,
    profile.city ? `Ubicacion: ${profile.city}` : "Ubicacion: por completar",
    `Estado: ${statusLabels[profile.status] || "Perfil activo"}`,
    `Experiencia declarada: ${profile.yearsExperience ?? 0} años`,
    "",
    "Resumen profesional",
    profile.bio || "Perfil profesional en actualizacion.",
    "",
    "Indicadores publicos",
    `Experiencias publicas: ${profile.experiences.length}`,
    `Experiencias validadas: ${validatedExperiences}`,
    `Proyectos vinculados: ${projects.length}`,
    `Evidencias publicas: ${publicEvidence}`,
    `Documentos verificados: ${verifiedDocuments} de ${profile.documents.length || 0}`,
    "",
    "Especialidades y herramientas",
    listOrFallback([...profile.professionalCategories, ...profile.specialties]),
    `Equipos: ${listOrFallback(profile.equipment)}`,
    `Software: ${listOrFallback(profile.software)}`,
    "",
    "Experiencia verificable",
    ...sectionLines(profile.experiences, (experience) => [
      `${experience.title}`,
      `Empresa: ${experience.companyName || experience.project?.clientName || "Por confirmar"} | Rol: ${experience.role || "Por completar"}`,
      `Periodo: ${formatPeriod(experience.startedAt, experience.endedAt)} | Ubicacion: ${experience.location || experience.project?.location || "No publica"}`,
      experience.project ? `Proyecto vinculado: ${experience.project.title}` : "Proyecto vinculado: no publico",
      `Validacion: ${experience.verifiedByTerraqo ? "Experiencia validada" : "Pendiente o parcial"}`,
      experience.verificationNote ? `Nota: ${experience.verificationNote}` : ""
    ], "Sin experiencias publicas registradas."),
    "",
    "Proyectos destacados",
    ...sectionLines(projects, (project) => [
      `${project.title}`,
      `Cliente: ${project.clientName || "No publico"} | Ubicacion: ${project.location || "No publica"}`,
      `Categoria: ${project.category || "Proyecto"} | Estado: ${project.status}`
    ], "Sin proyectos publicos vinculados."),
    "",
    "Trabajo documentado reciente",
    ...sectionLines(profile.worklogs, (worklog) => {
      const checks = Number(worklog.evidenceStatus !== "DECLARED") + Number(worklog.validations.length > 0);
      return [
        `${formatDate(worklog.occurredAt)} | ${worklog.title}`,
        worklog.summary,
        worklog.project ? `Proyecto: ${worklog.project.title}` : "",
        `Evidencia: ${evidenceLabels[worklog.evidenceStatus] || "Registrada"} | ${checks} check${checks === 1 ? "" : "s"}`
      ];
    }, "Sin bitacoras publicas registradas."),
    "",
    "Confianza y documentos",
    ...sectionLines(profile.documents, (document) => [
      `${documentLabels[document.type] || documentLabels.OTHER}: ${document.reviewStatus === "VERIFIED" ? "verificado" : "en revision"}`,
      `Cargado: ${formatDate(document.uploadedAt)}${document.reviewedAt ? ` | Revisado: ${formatDate(document.reviewedAt)}` : ""}`
    ], "Sin documentos publicos registrados."),
    "",
    "Este PDF es una version exportada del CV Vivo Terraqo. La informacion puede actualizarse cuando el profesional registra nueva evidencia, proyectos o validaciones."
  ].filter(Boolean);
}

function uniqueProjects(profile: PublicCvProfile): ProjectSnapshot[] {
  const projects = new Map<string, ProjectSnapshot>();
  for (const experience of profile.experiences) {
    if (!experience.project) continue;
    projects.set(experience.project.id, {
      id: experience.project.id,
      title: experience.project.title,
      clientName: experience.project.clientName,
      location: experience.project.location,
      category: experience.project.category,
      status: experience.project.status
    });
  }
  for (const worklog of profile.worklogs) {
    if (!worklog.project) continue;
    projects.set(worklog.project.id, {
      id: worklog.project.id,
      title: worklog.project.title,
      clientName: worklog.project.clientName,
      location: worklog.project.location,
      category: worklog.project.category,
      status: worklog.project.status
    });
  }
  return Array.from(projects.values());
}

function sectionLines<T>(items: T[], render: (item: T) => string[], empty: string) {
  if (!items.length) return [`- ${empty}`];
  return items.flatMap((item, index) => [`${index + 1}. ${render(item).filter(Boolean).join(" | ")}`]);
}

function listOrFallback(items: string[]) {
  const values = items.filter(Boolean);
  return values.length ? values.join(", ") : "Por completar";
}

function formatDate(date?: Date | null) {
  if (!date) return "Por confirmar";
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" }).format(date).replace(".", "");
}

function formatPeriod(start?: Date | null, end?: Date | null) {
  const startLabel = start ? formatDate(start) : "Sin fecha";
  const endLabel = end ? formatDate(end) : "Actualidad";
  return `${startLabel} - ${endLabel}`;
}

function createCvPdf(lines: string[], username: string) {
  const preparedLines = lines.flatMap((line) => wrapLine(safePdfText(line), 92));
  const pages = chunk(preparedLines, 42);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];
  const pageRefs: string[] = [];

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = pageObjectNumber + 1;
    pageRefs.push(`${pageObjectNumber} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    const content = pageContent(pageLines, index + 1, pages.length, username);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "binary"));
}

function pageContent(lines: string[], page: number, totalPages: number, username: string) {
  return [
    "q 0.86 0.94 0.93 rg 38 782 519 28 re f Q",
    "BT /F2 10 Tf 0 0.48 0.45 rg 50 792 Td (TQ terraqo CV Vivo) Tj ET",
    "BT /F1 8 Tf 0.35 0.45 0.49 rg 420 792 Td (terraqoglobal.com/cv/" + escapePdf(safePdfText(username)) + ") Tj ET",
    "BT /F2 42 Tf 0.88 0.94 0.93 rg 116 430 Td (TERRAQO CV VIVO) Tj ET",
    "BT /F1 10 Tf 0.04 0.12 0.16 rg 50 748 Td 14 TL",
    ...lines.map((line, index) => `${index === 0 ? "" : "T*"}(${escapePdf(line)}) Tj`),
    "ET",
    "q 0.96 0.98 0.98 rg 38 32 519 30 re f Q",
    "BT /F2 9 Tf 0 0.48 0.45 rg 50 44 Td (TQ terraqo) Tj ET",
    "BT /F1 8 Tf 0.35 0.45 0.49 rg 122 44 Td (CV Vivo exportado con evidencia verificable) Tj ET",
    `BT /F1 8 Tf 0.35 0.45 0.49 rg 486 44 Td (Pagina ${page}/${totalPages}) Tj ET`
  ].join("\n");
}

function safePdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdf(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(value: string, limit: number) {
  if (value.length <= limit) return [value];
  const words = value.split(" ");
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    if (`${current} ${word}`.trim().length > limit) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  });
  if (current) lines.push(current);
  return lines;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}
