import QRCode from "qrcode";
import sharp from "sharp";
import { PDFDocument, PDFImage, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { PublicCvProfile } from "@/lib/terraqo/public-cv";

const PAGE = { width: 595.28, height: 841.89 } as const;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const FOOTER_Y = 34;
const COLORS = {
  ink: rgb(13 / 255, 30 / 255, 47 / 255),
  muted: rgb(76 / 255, 96 / 255, 116 / 255),
  blue: rgb(45 / 255, 97 / 255, 159 / 255),
  cyan: rgb(24 / 255, 164 / 255, 184 / 255),
  green: rgb(0 / 255, 121 / 255, 94 / 255),
  line: rgb(215 / 255, 225 / 255, 235 / 255),
  white: rgb(1, 1, 1),
} as const;

type Fonts = { regular: PDFFont; bold: PDFFont };
type Experience = PublicCvProfile["experiences"][number];
type Education = PublicCvProfile["education"][number];
type Flow = { pdf: PDFDocument; page: PDFPage; y: number; pageIndex: number };
type PdfAssets = { qr: PDFImage; companyLogos: Map<string, PDFImage> };

/**
 * Linear ATS-oriented PDF: standard fonts, conventional headings, selectable
 * text and a content-stream order that mirrors visual reading order. Logos are
 * secondary; employer names always remain real text.
 */
export async function createExecutiveCvPdf(profile: PublicCvProfile, requestUrl: string) {
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const publicUrl = `https://terraqoglobal.com/cv/${profile.username || "perfil"}`;
  const assets = await loadAssets(pdf, profile, requestUrl, publicUrl);
  const metrics = getMetrics(profile);
  const name = clean(profile.user.name || profile.username || "Profesional Terraqo");

  pdf.setTitle(`${name} | Curriculum vitae`);
  pdf.setAuthor(name);
  pdf.setSubject("Curriculum vitae profesional con trayectoria y validaciones Terraqo");
  pdf.setKeywords(["curriculum vitae", "experiencia profesional", ...collectSkills(profile).slice(0, 8)]);
  pdf.setCreator("Terraqo CV Vivo");
  pdf.setProducer("Terraqo");
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());

  const flow: Flow = { pdf, page: pdf.addPage([PAGE.width, PAGE.height]), y: 0, pageIndex: 0 };
  drawFirstPageHeader(flow, profile, fonts, publicUrl);

  section(flow, fonts, "Resumen profesional");
  paragraph(flow, fonts, cleanSummary(profile.bio), 9.4, 13.2, COLORS.ink);

  const skills = collectSkills(profile);
  if (skills.length) {
    section(flow, fonts, "Competencias clave");
    paragraph(flow, fonts, skills.slice(0, 14).join(" | "), 9, 12.5, COLORS.ink);
  }

  section(flow, fonts, "Experiencia profesional");
  if (profile.experiences.length) {
    for (const experience of profile.experiences) {
      drawExperience(flow, profile, experience, fonts, assets.companyLogos, name, publicUrl);
    }
  } else {
    paragraph(flow, fonts, "Sin experiencia profesional pública registrada.", 9, 12, COLORS.muted);
  }

  if (flow.y < 350) newPage(flow, fonts, name, publicUrl);
  section(flow, fonts, "Formación académica");
  if (profile.education.length) {
    for (const education of profile.education) drawEducation(flow, education, fonts, name, publicUrl);
  } else {
    paragraph(flow, fonts, "Sin formación académica pública registrada.", 9, 12, COLORS.muted);
  }

  if (profile.certifications.length) {
    section(flow, fonts, "Certificaciones");
    drawSimpleList(flow, fonts, uniqueStrings(profile.certifications).slice(0, 18), name, publicUrl);
  }

  const tools = uniqueStrings([...profile.software, ...profile.equipment]);
  if (tools.length) {
    section(flow, fonts, "Herramientas y tecnología");
    paragraph(flow, fonts, tools.slice(0, 18).join(" | "), 9, 12.5, COLORS.ink);
  }

  ensureSpace(flow, 150, fonts, name, publicUrl);
  section(flow, fonts, "Verificación Terraqo");
  drawSimpleList(flow, fonts, [
    `Identidad: ${profile.identityVerificationStatus === "VERIFIED" ? "verificada" : "pendiente de verificación"}`,
    `Experiencias validadas: ${metrics.validatedExperiences} de ${profile.experiences.length}`,
    `Documentos revisados: ${metrics.verifiedDocuments}`,
    `Evidencias públicas: ${metrics.publicEvidence}`,
  ], name, publicUrl);

  drawPresence(flow, profile, fonts, assets.qr, publicUrl, name);

  const pages = pdf.getPages();
  pages.forEach((page, index) => drawFooter(page, fonts, index + 1, pages.length, publicUrl));
  return pdf.save({ useObjectStreams: false, addDefaultPage: false });
}

async function embedFonts(pdf: PDFDocument): Promise<Fonts> {
  return {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
}

async function loadAssets(pdf: PDFDocument, profile: PublicCvProfile, requestUrl: string, publicUrl: string): Promise<PdfAssets> {
  const qr = await pdf.embedPng(await QRCode.toBuffer(publicUrl, {
    type: "png",
    width: 220,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0D1E2F", light: "#FFFFFF" },
  }));
  const sources = new Map<string, string>();
  for (const experience of profile.experiences) {
    const company = companyName(experience);
    const source = companyLogoSource(profile, experience);
    if (company && source) sources.set(normalizeCompany(company), source);
  }
  const companyLogos = new Map<string, PDFImage>();
  await Promise.all([...sources.entries()].map(async ([company, source]) => {
    const image = await loadImage(pdf, source, requestUrl);
    if (image) companyLogos.set(company, image);
  }));
  return { qr, companyLogos };
}

async function loadImage(pdf: PDFDocument, imageUrl: string, requestUrl: string) {
  for (const url of safeImageCandidates(imageUrl, requestUrl)) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4_000), cache: "no-store" });
      if (!response.ok) continue;
      let bytes = new Uint8Array(await response.arrayBuffer());
      const type = (response.headers.get("content-type") || "").toLowerCase();
      if (type.includes("svg") || looksLikeSvg(bytes)) bytes = new Uint8Array(await sharp(bytes).png().toBuffer());
      if (type.includes("png") || isPng(bytes)) return pdf.embedPng(bytes);
      if (type.includes("jpeg") || type.includes("jpg") || isJpeg(bytes)) return pdf.embedJpg(bytes);
    } catch {
      continue;
    }
  }
  return null;
}

function safeImageCandidates(imageUrl: string, requestUrl: string) {
  const result: URL[] = [];
  try {
    const requestOrigin = new URL(requestUrl).origin;
    const candidate = new URL(imageUrl, requestOrigin);
    if (isAllowedImageHost(candidate, requestOrigin)) result.push(candidate);
    if (imageUrl.startsWith("/")) {
      const production = new URL(imageUrl, "https://terraqoglobal.com");
      if (!result.some((item) => item.href === production.href)) result.push(production);
    }
  } catch {}
  return result;
}

function isAllowedImageHost(url: URL, requestOrigin: string) {
  if (!/^https?:$/.test(url.protocol)) return false;
  const requestHost = new URL(requestOrigin).hostname;
  const host = url.hostname.toLowerCase();
  if (host === requestHost) return true;
  if (host === "terraqoglobal.com" || host.endsWith(".terraqoglobal.com")) return true;
  if (host === "lh3.googleusercontent.com" || host === "avatars.githubusercontent.com") return true;
  return process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1");
}

function drawFirstPageHeader(flow: Flow, profile: PublicCvProfile, fonts: Fonts, publicUrl: string) {
  const name = clean(profile.user.name || profile.username || "Profesional Terraqo");
  drawText(flow.page, "TERRAQO CV VIVO", MARGIN, 800, 8, fonts.bold, COLORS.blue);
  drawText(flow.page, "CURRICULUM VITAE", PAGE.width - MARGIN, 800, 7.5, fonts.bold, COLORS.muted, "right");
  drawText(flow.page, name, MARGIN, 760, 27, fonts.bold, COLORS.ink);
  drawText(flow.page, truncateText(clean(profile.headline || "Perfil profesional"), fonts.bold, 12.5, CONTENT_WIDTH), MARGIN, 738, 12.5, fonts.bold, COLORS.blue);
  const contact = [profileLocation(profile), shortUrl(publicUrl)].filter(Boolean).join(" | ");
  drawText(flow.page, truncateText(contact, fonts.regular, 8.5, CONTENT_WIDTH), MARGIN, 719, 8.5, fonts.regular, COLORS.muted);
  flow.page.drawLine({ start: { x: MARGIN, y: 701 }, end: { x: PAGE.width - MARGIN, y: 701 }, color: COLORS.cyan, thickness: 2 });
  flow.y = 678;
}

function newPage(flow: Flow, fonts: Fonts, name: string, publicUrl: string) {
  flow.page = flow.pdf.addPage([PAGE.width, PAGE.height]);
  flow.pageIndex += 1;
  drawText(flow.page, name, MARGIN, 799, 9, fonts.bold, COLORS.ink);
  drawText(flow.page, shortUrl(publicUrl), PAGE.width - MARGIN, 799, 7.5, fonts.regular, COLORS.muted, "right");
  flow.page.drawLine({ start: { x: MARGIN, y: 785 }, end: { x: PAGE.width - MARGIN, y: 785 }, color: COLORS.line, thickness: 1 });
  flow.y = 758;
}

function ensureSpace(flow: Flow, height: number, fonts: Fonts, name: string, publicUrl: string) {
  if (flow.y - height < FOOTER_Y + 28) newPage(flow, fonts, name, publicUrl);
}

function section(flow: Flow, fonts: Fonts, title: string) {
  flow.y -= 7;
  drawText(flow.page, title.toUpperCase(), MARGIN, flow.y, 9, fonts.bold, COLORS.blue);
  flow.y -= 12;
  flow.page.drawLine({ start: { x: MARGIN, y: flow.y }, end: { x: PAGE.width - MARGIN, y: flow.y }, color: COLORS.line, thickness: 0.8 });
  flow.y -= 17;
}

function paragraph(flow: Flow, fonts: Fonts, text: string, size: number, lineHeight: number, color = COLORS.ink) {
  for (const line of wrapText(text, fonts.regular, size, CONTENT_WIDTH)) {
    drawText(flow.page, line, MARGIN, flow.y, size, fonts.regular, color);
    flow.y -= lineHeight;
  }
  flow.y -= 9;
}

function drawExperience(flow: Flow, profile: PublicCvProfile, experience: Experience, fonts: Fonts, logos: Map<string, PDFImage>, name: string, publicUrl: string) {
  const detailLines = experienceDetailLines(experience, fonts);
  const height = 53 + detailLines.length * 11;
  ensureSpace(flow, height, fonts, name, publicUrl);
  const company = companyName(experience);
  const logo = logos.get(normalizeCompany(company));
  const titleWidth = logo ? CONTENT_WIDTH - 145 : CONTENT_WIDTH - 120;
  drawText(flow.page, truncateText(clean(experience.role || experience.title), fonts.bold, 11, titleWidth), MARGIN, flow.y, 11, fonts.bold, COLORS.ink);
  if (experience.verifiedByTerraqo || experience.verificationStatus === "APPROVED") {
    drawText(flow.page, "VALIDADA POR TERRAQO", PAGE.width - MARGIN - (logo ? 52 : 0), flow.y + 1, 6.6, fonts.bold, COLORS.green, "right");
  }
  if (logo) drawLogo(flow.page, logo, PAGE.width - MARGIN - 42, flow.y - 5, 42, 19);
  flow.y -= 15;
  drawText(flow.page, truncateText(company, fonts.bold, 9.4, 325), MARGIN, flow.y, 9.4, fonts.bold, COLORS.blue);
  drawText(flow.page, formatPeriod(experience.startedAt, experience.endedAt, experience.currentlyWorking), PAGE.width - MARGIN, flow.y, 8.2, fonts.regular, COLORS.muted, "right");
  flow.y -= 13;
  const location = clean(experience.location || experience.locationCity || experience.project?.location || "");
  if (location) {
    drawText(flow.page, truncateText(location, fonts.regular, 8.2, CONTENT_WIDTH), MARGIN, flow.y, 8.2, fonts.regular, COLORS.muted);
    flow.y -= 12;
  }
  for (const line of detailLines) {
    drawText(flow.page, "-", MARGIN, flow.y, 8.4, fonts.bold, COLORS.blue);
    drawText(flow.page, line, MARGIN + 10, flow.y, 8.4, fonts.regular, COLORS.ink);
    flow.y -= 11;
  }
  flow.y -= 11;
}

function experienceDetailLines(experience: Experience, fonts: Fonts) {
  const details = uniqueStrings([...(experience.highlights || []), ...(experience.summary ? [experience.summary] : [])]).slice(0, 3);
  const lines: string[] = [];
  for (const detail of details) {
    lines.push(...wrapText(clean(detail), fonts.regular, 8.4, CONTENT_WIDTH - 10, 2));
    if (lines.length >= 5) break;
  }
  return lines.slice(0, 5);
}

function drawEducation(flow: Flow, education: Education, fonts: Fonts, name: string, publicUrl: string) {
  const height = education.field ? 55 : 43;
  ensureSpace(flow, height, fonts, name, publicUrl);
  drawText(flow.page, truncateText(clean(education.degree), fonts.bold, 10.5, 360), MARGIN, flow.y, 10.5, fonts.bold, COLORS.ink);
  if (education.verificationStatus === "APPROVED") drawText(flow.page, "VERIFICADA", PAGE.width - MARGIN, flow.y, 6.6, fonts.bold, COLORS.green, "right");
  flow.y -= 14;
  drawText(flow.page, truncateText(clean(education.institution), fonts.bold, 9, 330), MARGIN, flow.y, 9, fonts.bold, COLORS.blue);
  drawText(flow.page, formatPeriod(education.startedAt, education.endedAt, education.currentlyStudying), PAGE.width - MARGIN, flow.y, 8.2, fonts.regular, COLORS.muted, "right");
  flow.y -= 13;
  if (education.field) {
    drawText(flow.page, truncateText(clean(education.field), fonts.regular, 8.3, CONTENT_WIDTH), MARGIN, flow.y, 8.3, fonts.regular, COLORS.muted);
    flow.y -= 12;
  }
  flow.y -= 10;
}

function drawSimpleList(flow: Flow, fonts: Fonts, items: string[], name: string, publicUrl: string) {
  for (const item of items) {
    const lines = wrapText(clean(item), fonts.regular, 8.6, CONTENT_WIDTH - 12, 3);
    ensureSpace(flow, lines.length * 11 + 5, fonts, name, publicUrl);
    drawText(flow.page, "-", MARGIN, flow.y, 8.6, fonts.bold, COLORS.blue);
    for (const line of lines) {
      drawText(flow.page, line, MARGIN + 11, flow.y, 8.6, fonts.regular, COLORS.ink);
      flow.y -= 11;
    }
    flow.y -= 3;
  }
  flow.y -= 4;
}

function drawPresence(flow: Flow, profile: PublicCvProfile, fonts: Fonts, qr: PDFImage, publicUrl: string, name: string) {
  ensureSpace(flow, 125, fonts, name, publicUrl);
  section(flow, fonts, "Contacto y presencia profesional");
  const links = uniqueStrings([publicUrl, ...profile.socialLinks.slice(0, 5).map((link) => link.url)]);
  let y = flow.y;
  for (const link of links) {
    drawText(flow.page, truncateText(shortUrl(link), fonts.regular, 8.3, CONTENT_WIDTH - 82), MARGIN, y, 8.3, fonts.regular, COLORS.ink);
    y -= 12;
  }
  flow.page.drawImage(qr, { x: PAGE.width - MARGIN - 54, y: flow.y - 45, width: 54, height: 54 });
  drawText(flow.page, "Perfil público", PAGE.width - MARGIN - 27, flow.y - 56, 6.5, fonts.bold, COLORS.muted, "center");
  flow.y = Math.min(y, flow.y - 68) - 6;
}

function drawLogo(page: PDFPage, logo: PDFImage, x: number, y: number, maxWidth: number, maxHeight: number) {
  const scaled = logo.scaleToFit(maxWidth, maxHeight);
  page.drawImage(logo, { x: x + (maxWidth - scaled.width) / 2, y: y + (maxHeight - scaled.height) / 2, width: scaled.width, height: scaled.height });
}

function drawFooter(page: PDFPage, fonts: Fonts, pageNumber: number, totalPages: number, publicUrl: string) {
  page.drawLine({ start: { x: MARGIN, y: 48 }, end: { x: PAGE.width - MARGIN, y: 48 }, color: COLORS.line, thickness: 0.8 });
  drawText(page, "CV generado desde información pública del perfil Terraqo", MARGIN, FOOTER_Y, 6.7, fonts.regular, COLORS.muted);
  drawText(page, shortUrl(publicUrl), PAGE.width / 2, FOOTER_Y, 6.7, fonts.regular, COLORS.blue, "center");
  drawText(page, `Página ${pageNumber} de ${totalPages}`, PAGE.width - MARGIN, FOOTER_Y, 6.7, fonts.regular, COLORS.muted, "right");
}

function drawText(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = COLORS.ink, align: "left" | "center" | "right" = "left") {
  const safe = clean(text);
  let drawX = x;
  const width = font.widthOfTextAtSize(safe, size);
  if (align === "center") drawX -= width / 2;
  if (align === "right") drawX -= width;
  page.drawText(safe, { x: drawX, y, size, font, color });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = Number.POSITIVE_INFINITY) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) lines[lines.length - 1] = truncateText(`${lines[lines.length - 1]}...`, font, size, maxWidth);
  return lines;
}

function truncateText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const safe = clean(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let value = safe;
  while (value.length && font.widthOfTextAtSize(`${value}...`, size) > maxWidth) value = value.slice(0, -1);
  return `${value.trimEnd()}...`;
}

function companyName(experience: Experience) {
  return clean(experience.companyName || experience.project?.clientName || experience.workspace?.brandName || experience.workspace?.name || "Organización no publicada");
}

function companyLogoSource(profile: PublicCvProfile, experience: Experience) {
  if (experience.workspace?.logoUrl) return experience.workspace.logoUrl;
  const target = normalizeCompany(companyName(experience));
  const affiliation = profile.affiliations.find((item) => {
    const names = [item.companyName, item.workspace.brandName, item.workspace.name, item.company?.tradeName, item.company?.legalName]
      .filter(Boolean)
      .map((value) => normalizeCompany(String(value)));
    return names.some((value) => value === target || value.includes(target) || target.includes(value));
  });
  const stored = affiliation?.company?.logoUrl || affiliation?.workspace.logoUrl;
  if (stored) return stored;
  if (/\bvrilla\b/i.test(companyName(experience))) return "/brand/companies/vrilla-logo-horizontal-dark.svg";
  return null;
}

function normalizeCompany(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(s\.?a\.?c\.?|s\.?a\.?s\.?|s\.?a\.?)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function collectSkills(profile: PublicCvProfile) {
  return uniqueStrings([...profile.professionalCategories, ...profile.specialties, ...profile.software]);
}

function getMetrics(profile: PublicCvProfile) {
  return {
    validatedExperiences: profile.experiences.filter((item) => item.verifiedByTerraqo || item.verificationStatus === "APPROVED").length,
    verifiedDocuments: profile.documents.filter((item) => item.reviewStatus === "VERIFIED").length,
    publicEvidence: profile.worklogs.length,
  };
}

function profileLocation(profile: PublicCvProfile) {
  const location = [profile.locationCity || profile.city, profile.region].filter(Boolean).join(", ");
  const status: Record<string, string> = { AVAILABLE: "Disponible", WORKING: "Trabajando", OPEN_TO_PROJECTS: "Disponible para proyectos", NOT_AVAILABLE: "No disponible" };
  return [location, status[profile.status] || "Perfil activo"].filter(Boolean).join(" | ");
}

function cleanSummary(summary: string | null) {
  return clean(summary || "Perfil profesional en actualización. La experiencia, formación y evidencia pública seleccionada por el profesional se reflejan en este documento.");
}

function formatPeriod(start: Date | null, end: Date | null, current: boolean) {
  if (!start) return current ? "Actualidad" : "Periodo no publicado";
  const format = new Intl.DateTimeFormat("es-PE", { month: "short", year: "numeric", timeZone: "UTC" });
  return `${format.format(start).replace(".", "")} - ${current || !end ? "Actualidad" : format.format(end).replace(".", "")}`;
}

function shortUrl(value: string) {
  return clean(value.replace(/^https?:\/\//, "").replace(/\/$/, ""));
}

function uniqueStrings(items: string[]) {
  const seen = new Set<string>();
  return items.map(clean).filter((item) => {
    const key = item.toLocaleLowerCase("es");
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clean(value: string) {
  return value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeSvg(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.slice(0, 256)).includes("<svg");
}

function isPng(bytes: Uint8Array) {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
