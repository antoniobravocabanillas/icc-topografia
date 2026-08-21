import QRCode from "qrcode";
import { PDFDocument, PDFImage, PDFFont, PDFPage, RGB, StandardFonts, rgb } from "pdf-lib";
import type { PublicCvProfile } from "@/lib/terraqo/public-cv";

const PAGE = { width: 595.28, height: 841.89 } as const;
const COLORS = {
  navy: rgb(14 / 255, 26 / 255, 38 / 255),
  navySoft: rgb(23 / 255, 39 / 255, 58 / 255),
  blue: rgb(67 / 255, 116 / 255, 186 / 255),
  blueBright: rgb(72 / 255, 138 / 255, 201 / 255),
  cyan: rgb(37 / 255, 192 / 255, 213 / 255),
  paper: rgb(247 / 255, 249 / 255, 252 / 255),
  white: rgb(1, 1, 1),
  ink: rgb(14 / 255, 26 / 255, 38 / 255),
  muted: rgb(91 / 255, 112 / 255, 137 / 255),
  line: rgb(215 / 255, 225 / 255, 238 / 255),
  paleBlue: rgb(235 / 255, 243 / 255, 252 / 255),
  paleCyan: rgb(229 / 255, 250 / 255, 252 / 255),
  green: rgb(0 / 255, 143 / 255, 111 / 255),
  paleGreen: rgb(229 / 255, 248 / 255, 241 / 255),
  amber: rgb(181 / 255, 112 / 255, 0 / 255),
  paleAmber: rgb(255 / 255, 244 / 255, 220 / 255)
} as const;

type Fonts = { regular: PDFFont; medium: PDFFont; bold: PDFFont; black: PDFFont };
type CvExperience = PublicCvProfile["experiences"][number];
type CvEducation = PublicCvProfile["education"][number];
type CvMetrics = {
  validatedExperiences: number;
  verifiedDocuments: number;
  publicEvidence: number;
  projects: ReturnType<typeof uniqueProjects>;
  trustAreas: number;
  trustScore: number;
};

export async function createExecutiveCvPdf(profile: PublicCvProfile, requestUrl: string) {
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const publicUrl = `https://terraqoglobal.com/cv/${profile.username || "perfil"}`;
  const avatar = await loadProfileImage(pdf, profile.user.image, requestUrl);
  const qr = await pdf.embedPng(await QRCode.toBuffer(publicUrl, {
    type: "png",
    width: 280,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0E1A26", light: "#FFFFFF" }
  }));
  const metrics = getMetrics(profile);

  pdf.setTitle(`${profile.user.name || "Perfil profesional"} | CV Vivo Terraqo`);
  pdf.setAuthor("Terraqo");
  pdf.setSubject("CV profesional dinámico con información pública y validaciones autorizadas");
  pdf.setKeywords(["Terraqo", "CV Vivo", "trayectoria", "validación", "evidencia"]);
  pdf.setCreator("Terraqo CV Vivo");
  pdf.setProducer("Terraqo");
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());

  drawExecutiveOverview(pdf.addPage([PAGE.width, PAGE.height]), profile, metrics, fonts, avatar, qr, publicUrl);
  drawExperiencePages(pdf, profile, metrics, fonts);
  drawEvidenceAndEducationPages(pdf, profile, metrics, fonts, publicUrl);

  const pages = pdf.getPages();
  pages.forEach((page, index) => drawFooter(page, fonts, index + 1, pages.length, publicUrl));
  return pdf.save({ useObjectStreams: false });
}

async function embedFonts(pdf: PDFDocument): Promise<Fonts> {
  return {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    medium: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    black: await pdf.embedFont(StandardFonts.HelveticaBold)
  };
}

async function loadProfileImage(pdf: PDFDocument, imageUrl: string | null, requestUrl: string) {
  if (!imageUrl) return null;
  const candidates = [new URL(imageUrl, requestUrl)];
  if (imageUrl.startsWith("/")) candidates.push(new URL(imageUrl, "https://terraqoglobal.com"));
  for (const url of candidates) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4_000), cache: "no-store" });
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const type = response.headers.get("content-type") || "";
      if (type.includes("png") || isPng(bytes)) return pdf.embedPng(bytes);
      if (type.includes("jpeg") || type.includes("jpg") || isJpeg(bytes)) return pdf.embedJpg(bytes);
    } catch {
      continue;
    }
  }
  return null;
}

function drawExecutiveOverview(page: PDFPage, profile: PublicCvProfile, metrics: CvMetrics, fonts: Fonts, avatar: PDFImage | null, qr: PDFImage, publicUrl: string) {
  fillPage(page, COLORS.paper);
  page.drawRectangle({ x: 0, y: 430, width: PAGE.width, height: PAGE.height - 430, color: COLORS.navy });
  drawSignalArcs(page, 480, 725);
  drawBrand(page, fonts, 48, 783, true);
  drawText(page, `EXPORTACIÓN EJECUTIVA · ${formatExportDate(new Date())}`, 548, 786, 7.5, fonts.bold, rgb(.62, .72, .84), "right");

  const name = profile.user.name || profile.username || "Profesional Terraqo";
  const headline = profile.headline || "Perfil profesional";
  const username = profile.username || "perfil";
  drawAvatar(page, fonts, avatar, name, 50, 627, 105);
  drawKicker(page, "PERFIL PROFESIONAL", 176, 691, fonts, COLORS.cyan);
  const titleHeight = drawWrappedText(page, name, 176, 664, 245, { font: fonts.black, size: 27, color: COLORS.white, lineHeight: 29, maxLines: 2 });
  drawText(page, truncateText(headline, fonts.bold, 14.5, 245), 176, 656 - titleHeight, 14.5, fonts.bold, COLORS.blueBright);
  drawText(page, profileLocation(profile), 176, 632 - titleHeight, 9.5, fonts.medium, rgb(.74, .81, .89));
  drawText(page, `@${username}`, 176, 615 - titleHeight, 8.5, fonts.bold, rgb(.64, .72, .82));

  page.drawRectangle({ x: 438, y: 584, width: 108, height: 128, color: COLORS.white, borderColor: rgb(.86, .9, .95), borderWidth: 1 });
  page.drawImage(qr, { x: 459, y: 625, width: 66, height: 66 });
  drawText(page, "ABRIR CV VIVO", 492, 608, 7.5, fonts.black, COLORS.ink, "center");
  drawText(page, "Escanea para ver", 492, 594, 6.5, fonts.regular, COLORS.muted, "center");

  drawKicker(page, "RESUMEN PROFESIONAL", 50, 553, fonts, COLORS.cyan);
  drawWrappedText(page, cleanSummary(profile.bio), 50, 533, 356, { font: fonts.regular, size: 9.3, lineHeight: 13, color: rgb(.82, .86, .92), maxLines: 6 });
  drawTrustPanel(page, metrics, fonts, 427, 452, 119, 112);

  drawKicker(page, "SEÑAL PROFESIONAL", 48, 393, fonts, COLORS.blue);
  page.drawRectangle({ x: 48, y: 306, width: 499, height: 68, color: COLORS.white, borderColor: COLORS.line, borderWidth: 1 });
  const metricItems = [
    [String(profile.experiences.length), "Experiencias", "públicas"],
    [String(metrics.validatedExperiences), "Trayectorias", "validadas"],
    [String(metrics.projects.length), "Proyectos", "vinculados"],
    [String(metrics.publicEvidence), "Registros", "de actividad"]
  ];
  metricItems.forEach(([value, label, detail], index) => {
    const x = 64 + index * 121;
    if (index) page.drawLine({ start: { x: x - 15, y: 320 }, end: { x: x - 15, y: 360 }, color: COLORS.line, thickness: 1 });
    drawText(page, value, x, 344, 18, fonts.black, COLORS.ink);
    drawText(page, label, x, 327, 7.8, fonts.bold, COLORS.muted);
    drawText(page, detail, x, 315, 7.2, fonts.regular, COLORS.muted);
  });

  drawKicker(page, "CAPACIDADES DESTACADAS", 48, 266, fonts, COLORS.blue);
  drawText(page, "Competencias que articulan", 48, 237, 17, fonts.black, COLORS.ink);
  drawText(page, "experiencia, criterio y ejecución.", 48, 217, 17, fonts.black, COLORS.ink);
  drawPills(page, collectSkills(profile).slice(0, 8), 48, 190, 270, fonts);

  page.drawLine({ start: { x: 334, y: 171 }, end: { x: 334, y: 266 }, color: COLORS.line, thickness: 1 });
  drawKicker(page, "CV VIVO", 358, 266, fonts, COLORS.blue);
  drawText(page, "Un documento conectado", 358, 237, 15.5, fonts.black, COLORS.ink);
  drawText(page, "a una fuente que evoluciona.", 358, 217, 15.5, fonts.black, COLORS.ink);
  drawWrappedText(page, "Este PDF registra el estado público del perfil al momento de exportarlo. Nuevas experiencias, evidencias y validaciones se consultan en línea.", 358, 194, 185, { font: fonts.regular, size: 8.4, lineHeight: 11, color: COLORS.muted, maxLines: 5 });
  drawText(page, shortUrl(publicUrl), 358, 130, 8.5, fonts.bold, COLORS.blue);
}

function drawExperiencePages(pdf: PDFDocument, profile: PublicCvProfile, metrics: CvMetrics, fonts: Fonts) {
  const groups = chunk(profile.experiences, 5);
  (groups.length ? groups : [[]]).forEach((experiences, groupIndex) => {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    fillPage(page, COLORS.paper);
    drawPageHeader(page, fonts, "TRAYECTORIA VERIFICABLE", groupIndex === 0 ? "Experiencia profesional" : "Experiencia · continuación", `${profile.experiences.length} públicas · ${metrics.validatedExperiences} validadas`);
    page.drawLine({ start: { x: 58, y: 666 }, end: { x: 58, y: 182 }, color: COLORS.line, thickness: 1.5 });
    if (!experiences.length) {
      drawEmptyState(page, fonts, "Sin experiencias públicas", "Las experiencias que el profesional decida publicar aparecerán aquí.", 68, 560, 460, 110);
      return;
    }
    let y = 660;
    experiences.forEach((experience) => {
      const height = 90;
      drawExperienceCard(page, experience, fonts, 74, y - height, 473, height);
      page.drawCircle({ x: 58, y: y - height / 2, size: 10, color: experience.verifiedByTerraqo ? COLORS.paleBlue : COLORS.paleAmber });
      page.drawCircle({ x: 58, y: y - height / 2, size: 5, color: experience.verifiedByTerraqo ? COLORS.blue : COLORS.amber });
      y -= height + 13;
    });
    if (groupIndex === groups.length - 1) {
      page.drawRectangle({ x: 48, y: 78, width: 499, height: 66, color: COLORS.navy });
      drawKicker(page, "TRAZABILIDAD", 65, 122, fonts, COLORS.cyan);
      drawWrappedText(page, "Cada estado refleja la información pública y las validaciones autorizadas disponibles al momento de exportar.", 65, 103, 310, { font: fonts.regular, size: 8.2, lineHeight: 10, color: rgb(.78, .85, .92), maxLines: 3 });
      drawText(page, "Consulta el perfil en vivo", 520, 104, 8.2, fonts.bold, COLORS.blueBright, "right");
    }
  });
}

function drawEvidenceAndEducationPages(pdf: PDFDocument, profile: PublicCvProfile, metrics: CvMetrics, fonts: Fonts, publicUrl: string) {
  const educationGroups = chunk(profile.education, 5);
  const groups = educationGroups.length ? educationGroups : [[]];
  groups.forEach((education, index) => {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    fillPage(page, COLORS.paper);
    drawPageHeader(page, fonts, "FORMACIÓN Y CONFIANZA", index === 0 ? "Credenciales profesionales" : "Formación · continuación", `${profile.education.length} formaciones públicas`);
    let y = 650;
    if (education.length) {
      education.forEach((item) => {
        drawEducationCard(page, item, fonts, 48, y - 66, 499, 66);
        y -= 76;
      });
    } else {
      drawEmptyState(page, fonts, "Formación en actualización", "La formación pública seleccionada por el profesional se incorporará a este documento.", 48, 532, 499, 100);
      y = 510;
    }
    if (index === groups.length - 1) {
      const blockY = Math.min(y - 12, 110);
      drawConfidenceSummary(page, profile, metrics, fonts, 48, blockY, 499, 148);
      drawPublicLinks(page, profile, fonts, 48, 36, 499, publicUrl);
    }
  });
}

function drawExperienceCard(page: PDFPage, experience: CvExperience, fonts: Fonts, x: number, y: number, width: number, height: number) {
  page.drawRectangle({ x, y, width, height, color: COLORS.white, borderColor: COLORS.line, borderWidth: 1 });
  page.drawRectangle({ x, y, width: 4, height, color: experience.verifiedByTerraqo ? COLORS.blue : COLORS.amber });
  const left = x + 18;
  const dividerX = x + 141;
  drawText(page, experiencePeriodLabel(experience), left, y + height - 23, 8.2, fonts.black, COLORS.ink);
  drawText(page, experience.location || experience.project?.location || "Ubicación no publicada", left, y + height - 38, 7.2, fonts.regular, COLORS.muted);
  drawText(page, formatPeriod(experience.startedAt, experience.endedAt, experience.currentlyWorking), left, y + height - 52, 6.8, fonts.regular, COLORS.muted);
  page.drawLine({ start: { x: dividerX, y: y + 15 }, end: { x: dividerX, y: y + height - 15 }, color: COLORS.line, thickness: 1 });
  drawText(page, truncateText(experience.title, fonts.black, 13, 200), dividerX + 16, y + height - 25, 13, fonts.black, COLORS.ink);
  drawText(page, truncateText(experience.companyName || experience.project?.clientName || "Organización no publicada", fonts.bold, 8.8, 205), dividerX + 16, y + height - 42, 8.8, fonts.bold, COLORS.blue);
  drawText(page, truncateText(experience.role || "Rol profesional", fonts.regular, 7.5, 205), dividerX + 16, y + height - 57, 7.5, fonts.regular, COLORS.muted);
  const validation = experience.verifiedByTerraqo ? "VALIDADA" : experience.verificationStatus === "REQUESTED" ? "EN REVISIÓN" : "DECLARADA";
  drawBadge(page, validation, x + width - 18, y + height - 28, fonts, experience.verifiedByTerraqo ? COLORS.paleGreen : COLORS.paleAmber, experience.verifiedByTerraqo ? COLORS.green : COLORS.amber);
  const detail = experience.highlights[0] || experience.summary;
  if (detail) drawWrappedText(page, detail, dividerX + 16, y + 22, width - 185, { font: fonts.regular, size: 6.9, lineHeight: 8.5, color: COLORS.muted, maxLines: 2 });
}

function drawEducationCard(page: PDFPage, item: CvEducation, fonts: Fonts, x: number, y: number, width: number, height: number) {
  const approved = item.verificationStatus === "APPROVED";
  page.drawRectangle({ x, y, width, height, color: COLORS.white, borderColor: COLORS.line, borderWidth: 1 });
  page.drawRectangle({ x: x + 13, y: y + 10, width: 40, height: 46, color: approved ? COLORS.paleCyan : COLORS.paleBlue });
  drawText(page, institutionInitials(item.institution), x + 33, y + 31, 9, fonts.black, approved ? COLORS.cyan : COLORS.blue, "center");
  drawText(page, truncateText(item.degree, fonts.black, 11, 270), x + 68, y + 46, 11, fonts.black, COLORS.ink);
  drawText(page, truncateText(item.institution, fonts.bold, 8, 280), x + 68, y + 29, 8, fonts.bold, COLORS.blue);
  drawText(page, truncateText(item.field || "Formación profesional", fonts.regular, 7, 275), x + 68, y + 14, 7, fonts.regular, COLORS.muted);
  drawText(page, formatPeriod(item.startedAt, item.endedAt, item.currentlyStudying), x + width - 17, y + 14, 6.8, fonts.medium, COLORS.muted, "right");
  drawBadge(page, approved ? "VERIFICADA" : item.verificationStatus === "REQUESTED" ? "EN REVISIÓN" : "DECLARADA", x + width - 17, y + 44, fonts, approved ? COLORS.paleGreen : COLORS.paleAmber, approved ? COLORS.green : COLORS.amber);
}

function drawConfidenceSummary(page: PDFPage, profile: PublicCvProfile, metrics: CvMetrics, fonts: Fonts, x: number, y: number, width: number, height: number) {
  page.drawRectangle({ x, y, width, height, color: COLORS.navy });
  drawKicker(page, "CONFIANZA Y VERIFICACIÓN", x + 18, y + height - 25, fonts, COLORS.cyan);
  drawText(page, `${metrics.trustScore}%`, x + 18, y + height - 66, 27, fonts.black, COLORS.white);
  drawText(page, `${metrics.trustAreas} de 4 áreas con señal pública`, x + 84, y + height - 49, 8.2, fonts.bold, rgb(.75, .83, .91));
  drawText(page, "Nivel de confianza documental del perfil exportado", x + 84, y + height - 65, 7.2, fonts.regular, rgb(.62, .72, .83));
  const entries = [
    [profile.identityVerificationStatus === "VERIFIED", profile.identityVerificationStatus === "VERIFIED" ? "Identidad verificada" : "Identidad pendiente"],
    [metrics.verifiedDocuments > 0, `${metrics.verifiedDocuments} documento${metrics.verifiedDocuments === 1 ? "" : "s"} revisado${metrics.verifiedDocuments === 1 ? "" : "s"}`],
    [metrics.validatedExperiences > 0, `${metrics.validatedExperiences} experiencia${metrics.validatedExperiences === 1 ? "" : "s"} validada${metrics.validatedExperiences === 1 ? "" : "s"}`],
    [metrics.publicEvidence > 0, `${metrics.publicEvidence} registro${metrics.publicEvidence === 1 ? "" : "s"} de actividad`]
  ] as const;
  entries.forEach(([complete, label], index) => {
    const itemX = x + 18 + (index % 2) * 236;
    const itemY = y + 48 - Math.floor(index / 2) * 29;
    page.drawCircle({ x: itemX + 5, y: itemY + 3, size: 4, color: complete ? COLORS.cyan : COLORS.amber });
    drawText(page, label, itemX + 16, itemY, 7.5, fonts.medium, complete ? COLORS.white : rgb(.77, .82, .88));
  });
}

function drawPublicLinks(page: PDFPage, profile: PublicCvProfile, fonts: Fonts, x: number, y: number, width: number, publicUrl: string) {
  drawKicker(page, "PRESENCIA PROFESIONAL", x, y + 53, fonts, COLORS.blue);
  drawText(page, shortUrl(publicUrl), x, y + 31, 8.5, fonts.bold, COLORS.ink);
  const links = profile.socialLinks.slice(0, 4).map((link) => `${link.label || platformLabel(link.platform)} · ${shortUrl(link.url)}`);
  drawWrappedText(page, links.length ? links.join("    ") : "El profesional todavía no publica enlaces adicionales.", x, y + 13, width, { font: fonts.regular, size: 7.4, lineHeight: 10, color: COLORS.muted, maxLines: 2 });
}

function drawTrustPanel(page: PDFPage, metrics: CvMetrics, fonts: Fonts, x: number, y: number, width: number, height: number) {
  page.drawRectangle({ x, y, width, height, color: COLORS.navySoft, borderColor: rgb(.19, .29, .4), borderWidth: 1 });
  drawText(page, "CONFIANZA", x + 14, y + height - 21, 7.2, fonts.black, rgb(.67, .76, .86));
  drawText(page, `${metrics.trustScore}%`, x + 14, y + height - 55, 24, fonts.black, COLORS.cyan);
  drawText(page, `${metrics.trustAreas}/4 áreas`, x + 14, y + height - 73, 8.2, fonts.bold, COLORS.white);
  page.drawRectangle({ x: x + 14, y: y + 22, width: width - 28, height: 6, color: rgb(.16, .25, .36) });
  page.drawRectangle({ x: x + 14, y: y + 22, width: (width - 28) * metrics.trustScore / 100, height: 6, color: COLORS.cyan });
  drawText(page, "Estado público actual", x + 14, y + 9, 6.3, fonts.regular, rgb(.58, .68, .8));
}

function drawAvatar(page: PDFPage, fonts: Fonts, avatar: PDFImage | null, name: string, x: number, y: number, size: number) {
  page.drawRectangle({ x: x - 4, y: y - 4, width: size + 8, height: size + 8, color: COLORS.white });
  page.drawRectangle({ x, y, width: size, height: size, color: COLORS.navySoft });
  if (avatar) {
    const scaled = avatar.scaleToFit(size, size);
    page.drawImage(avatar, { x: x + (size - scaled.width) / 2, y: y + (size - scaled.height) / 2, width: scaled.width, height: scaled.height });
  } else {
    drawText(page, initials(name), x + size / 2, y + size / 2 - 8, 24, fonts.black, COLORS.cyan, "center");
  }
  page.drawCircle({ x: x + size - 5, y: y + 7, size: 7, color: COLORS.cyan, borderColor: COLORS.white, borderWidth: 2 });
}

function drawBrand(page: PDFPage, fonts: Fonts, x: number, y: number, inverse = false) {
  const color = inverse ? COLORS.white : COLORS.navy;
  page.drawCircle({ x: x + 14, y: y + 4, size: 14, borderColor: inverse ? COLORS.cyan : COLORS.blue, borderWidth: 2 });
  page.drawLine({ start: { x: x + 14, y: y - 2 }, end: { x: x + 14, y: y + 11 }, color: inverse ? COLORS.cyan : COLORS.blue, thickness: 1.3 });
  page.drawCircle({ x: x + 14, y: y + 4, size: 2.8, color: inverse ? COLORS.cyan : COLORS.blue });
  drawText(page, "TQ", x - 1, y - 2, 14, fonts.black, color);
  drawText(page, "TERRAQO", x + 38, y - 1, 13, fonts.black, color);
  drawText(page, "CV VIVO", x + 111, y, 6.6, fonts.bold, inverse ? COLORS.cyan : COLORS.blue);
}

function drawPageHeader(page: PDFPage, fonts: Fonts, kicker: string, title: string, meta: string) {
  page.drawRectangle({ x: 0, y: 696, width: PAGE.width, height: 146, color: COLORS.navy });
  drawSignalArcs(page, 516, 783);
  drawBrand(page, fonts, 48, 800, true);
  drawKicker(page, kicker, 48, 758, fonts, COLORS.cyan);
  drawText(page, title, 48, 716, 25, fonts.black, COLORS.white);
  drawText(page, meta, 547, 731, 8.2, fonts.bold, rgb(.7, .79, .88), "right");
  drawText(page, "Estado visible al momento de exportar", 547, 715, 7, fonts.regular, rgb(.55, .66, .78), "right");
}

function drawFooter(page: PDFPage, fonts: Fonts, pageNumber: number, totalPages: number, publicUrl: string) {
  page.drawLine({ start: { x: 48, y: 42 }, end: { x: 547, y: 42 }, color: COLORS.line, thickness: .8 });
  drawText(page, "TERRAQO · CV VIVO · Documento profesional verificable", 48, 25, 6.5, fonts.medium, COLORS.muted);
  drawText(page, shortUrl(publicUrl), 300, 25, 6.5, fonts.medium, COLORS.blue, "center");
  drawText(page, `Página ${pageNumber} / ${totalPages}`, 547, 25, 6.5, fonts.medium, COLORS.muted, "right");
}

function drawSignalArcs(page: PDFPage, x: number, y: number) {
  [55, 86, 118].forEach((radius, index) => page.drawCircle({ x, y, size: radius, borderColor: COLORS.blue, borderWidth: .7, opacity: .25 - index * .04 }));
  page.drawLine({ start: { x: x - 60, y: y - 85 }, end: { x: x + 38, y: y + 28 }, color: COLORS.cyan, thickness: .8, opacity: .28 });
}

function drawEmptyState(page: PDFPage, fonts: Fonts, title: string, text: string, x: number, y: number, width: number, height: number) {
  page.drawRectangle({ x, y, width, height, color: COLORS.white, borderColor: COLORS.line, borderWidth: 1 });
  drawText(page, title, x + 20, y + height - 37, 14, fonts.black, COLORS.ink);
  drawWrappedText(page, text, x + 20, y + height - 57, width - 40, { font: fonts.regular, size: 8.2, lineHeight: 11, color: COLORS.muted, maxLines: 3 });
}

function drawKicker(page: PDFPage, text: string, x: number, y: number, fonts: Fonts, color: RGB) {
  drawText(page, text, x, y, 7.5, fonts.black, color);
}

function drawBadge(page: PDFPage, text: string, rightX: number, y: number, fonts: Fonts, background: RGB, color: RGB) {
  const size = 6.5;
  const width = fonts.bold.widthOfTextAtSize(text, size) + 20;
  page.drawRectangle({ x: rightX - width, y: y - 2, width, height: 18, color: background });
  page.drawCircle({ x: rightX - width + 9, y: y + 7, size: 2.2, color });
  drawText(page, text, rightX - 7, y + 3, size, fonts.bold, color, "right");
}

function drawPills(page: PDFPage, items: string[], x: number, y: number, maxWidth: number, fonts: Fonts) {
  const values = items.length ? items : ["Perfil en construcción"];
  let cursorX = x;
  let cursorY = y;
  values.forEach((item) => {
    const size = 7.1;
    const width = Math.min(fonts.bold.widthOfTextAtSize(item, size) + 19, maxWidth);
    if (cursorX + width > x + maxWidth) {
      cursorX = x;
      cursorY -= 25;
    }
    page.drawRectangle({ x: cursorX, y: cursorY, width, height: 19, color: COLORS.paleBlue, borderColor: COLORS.line, borderWidth: .5 });
    drawText(page, truncateText(item, fonts.bold, size, width - 14), cursorX + 9, cursorY + 6, size, fonts.bold, COLORS.ink);
    cursorX += width + 7;
  });
}

function drawWrappedText(page: PDFPage, text: string, x: number, y: number, width: number, options: { font: PDFFont; size: number; color: RGB; lineHeight: number; maxLines?: number }) {
  const lines = wrapText(text, options.font, options.size, width, options.maxLines);
  lines.forEach((line, index) => drawText(page, line, x, y - index * options.lineHeight, options.size, options.font, options.color));
  return lines.length * options.lineHeight;
}

function drawText(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color: RGB, align: "left" | "center" | "right" = "left") {
  text = polishSpanishText(text);
  let drawX = x;
  const width = font.widthOfTextAtSize(text, size);
  if (align === "center") drawX -= width / 2;
  if (align === "right") drawX -= width;
  page.drawText(text, { x: drawX, y, size, font, color });
}

function fillPage(page: PDFPage, color: RGB) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = Number.POSITIVE_INFINITY) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) lines[lines.length - 1] = truncateText(`${lines[lines.length - 1]}…`, font, size, maxWidth);
  return lines;
}

function truncateText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let value = text;
  while (value.length && font.widthOfTextAtSize(`${value}…`, size) > maxWidth) value = value.slice(0, -1);
  return `${value.trimEnd()}…`;
}

function getMetrics(profile: PublicCvProfile): CvMetrics {
  const validatedExperiences = profile.experiences.filter((item) => item.verifiedByTerraqo || item.verificationStatus === "APPROVED").length;
  const verifiedDocuments = profile.documents.filter((item) => item.reviewStatus === "VERIFIED").length;
  const publicEvidence = profile.worklogs.length;
  const projects = uniqueProjects(profile);
  const trustAreas = Number(profile.identityVerificationStatus === "VERIFIED") + Number(verifiedDocuments > 0) + Number(validatedExperiences > 0) + Number(publicEvidence > 0);
  return { validatedExperiences, verifiedDocuments, publicEvidence, projects, trustAreas, trustScore: trustAreas * 25 };
}

function uniqueProjects(profile: PublicCvProfile) {
  const projects = new Map<string, { id: string; title: string }>();
  profile.experiences.forEach((item) => item.project && projects.set(item.project.id, { id: item.project.id, title: item.project.title }));
  profile.worklogs.forEach((item) => item.project && projects.set(item.project.id, { id: item.project.id, title: item.project.title }));
  return [...projects.values()];
}

function collectSkills(profile: PublicCvProfile) {
  return uniqueStrings([...profile.professionalCategories, ...profile.specialties, ...profile.worklogs.flatMap((item) => item.skills)]).filter((item) => item.length <= 42);
}

function profileLocation(profile: PublicCvProfile) {
  const location = [profile.locationCity || profile.city, profile.region].filter(Boolean).join(", ") || "Ubicación por completar";
  const status: Record<string, string> = { AVAILABLE: "Disponible ahora", WORKING: "Trabajando", OPEN_TO_PROJECTS: "Disponible para proyectos", NOT_AVAILABLE: "No disponible" };
  return `${location}  ·  ${status[profile.status] || "Perfil activo"}`;
}

function cleanSummary(summary: string | null) {
  return summary?.replace(/\s+/g, " ").trim() || "Perfil profesional en actualización. La experiencia, formación y evidencia pública seleccionada por el profesional se reflejan en este documento.";
}

function experiencePeriodLabel(item: CvExperience) {
  if (!item.startedAt) return "PERIODO REGISTRADO";
  const start = item.startedAt.getUTCFullYear();
  const end = item.currentlyWorking || !item.endedAt ? "ACTUALIDAD" : String(item.endedAt.getUTCFullYear());
  return `${start} – ${end}`;
}

function formatPeriod(start: Date | null, end: Date | null, current: boolean) {
  if (!start) return current ? "Actualidad" : "Periodo no publicado";
  const format = new Intl.DateTimeFormat("es-PE", { month: "short", year: "numeric", timeZone: "UTC" });
  return `${format.format(start).replace(".", "")} – ${current || !end ? "Actualidad" : format.format(end).replace(".", "")}`;
}

function formatExportDate(date: Date) {
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Lima" }).format(date).replace(".", "").toUpperCase();
}

function institutionInitials(value: string) {
  return value.split(/\s+/).filter((word) => word.length > 2).slice(0, 3).map((word) => word[0]).join("").toUpperCase() || "EDU";
}

function platformLabel(platform: string) {
  return platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase();
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function shortUrl(value: string) {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function polishSpanishText(value: string) {
  return value
    .replace(/\bInformatica\b/gi, "Informática")
    .replace(/\bAnalisis\b/gi, "Análisis")
    .replace(/\bmacroeconomicos\b/gi, "macroeconómicos")
    .replace(/\bPeru\b/g, "Perú")
    .replace(/\bpublica\b/gi, (match) => match[0] === "P" ? "Pública" : "pública")
    .replace(/\bpublicas\b/gi, (match) => match[0] === "P" ? "Públicas" : "públicas");
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function isPng(bytes: Uint8Array) {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
