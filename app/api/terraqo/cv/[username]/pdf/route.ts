import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type CvPdfRouteProps = {
  params: Promise<{ username: string }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const evidenceLabels: Record<string, string> = {
  DECLARED: "Declarado por el profesional",
  LINKED: "Vinculado a proyecto",
  CONFIRMED: "Confirmado por la empresa",
  VERIFIED: "Verificado por Terraqo"
};

export async function GET(_request: Request, { params }: CvPdfRouteProps) {
  const { username } = await params;
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { username },
    include: {
      user: { select: { name: true, email: true } },
      experiences: {
        where: { visibility: "PUBLIC" },
        include: { project: { select: { title: true, location: true } } },
        orderBy: [{ verifiedByTerraqo: "desc" }, { startedAt: "desc" }],
        take: 10
      },
      worklogs: {
        where: { visibility: "PUBLIC", deletedAt: null },
        include: {
          project: { select: { title: true } },
          validations: { where: { status: "APPROVED" }, select: { id: true }, take: 1 }
        },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 10
      }
    }
  });

  if (!profile || !profile.liveCvEnabled || profile.liveCvVisibility !== "PUBLIC") {
    return NextResponse.json({ error: "CV publico no disponible" }, { status: 404 });
  }

  const name = profile.user.name || profile.username || "Profesional Terraqo";
  const lines = [
    "TERRAQO - CV VIVO PROFESIONAL",
    "",
    name,
    profile.headline || "Perfil profesional",
    profile.city ? `Ubicacion: ${profile.city}` : "",
    `Experiencia declarada: ${profile.yearsExperience ?? 0} anos`,
    profile.username ? `Perfil publico: terraqoglobal.com/cv/${profile.username}` : "",
    "",
    "Resumen profesional",
    profile.bio || "Perfil profesional en actualizacion.",
    "",
    "Especialidades y herramientas",
    [...profile.professionalCategories, ...profile.specialties, ...profile.equipment, ...profile.software].join(", ") || "Por completar",
    "",
    "Experiencia validable",
    ...profile.experiences.flatMap((experience) => [
      `- ${experience.title}`,
      `  Empresa: ${experience.companyName || "Por confirmar"} | Rol: ${experience.role || "Por completar"}`,
      experience.project ? `  Proyecto: ${experience.project.title}` : "",
      `  Validacion: ${experience.verifiedByTerraqo ? "1 check por responsable o workspace autorizado" : "Pendiente"}`
    ]),
    !profile.experiences.length ? "- Sin experiencias publicas registradas." : "",
    "",
    "Trabajo documentado reciente",
    ...profile.worklogs.flatMap((worklog) => {
      const checks = Number(worklog.evidenceStatus !== "DECLARED") + Number(worklog.validations.length > 0);
      return [
        `- ${new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(worklog.occurredAt)} | ${worklog.title}`,
        `  ${worklog.summary}`,
        worklog.project ? `  Proyecto: ${worklog.project.title}` : "",
        `  Evidencia: ${evidenceLabels[worklog.evidenceStatus] || "Registrada"} | ${checks} check${checks === 1 ? "" : "s"}`
      ];
    }),
    !profile.worklogs.length ? "- Sin bitacoras publicas registradas." : "",
    "",
    "Documento generado por Terraqo. El CV vivo se actualiza con evidencia y validaciones autorizadas."
  ].filter(Boolean);

  const pdf = createSimplePdf(lines);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cv-${profile.username}.pdf"`
    }
  });
}

function createSimplePdf(lines: string[]) {
  const escapedLines = lines.flatMap((line) => wrapLine(safePdfText(line), 88));
  const content = [
    "BT",
    "/F1 11 Tf",
    "50 790 Td",
    "14 TL",
    ...escapedLines.slice(0, 52).map((line, index) => `${index === 0 ? "" : "T*"}(${escapePdf(line)}) Tj`),
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];

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
