import type { Prisma } from "@prisma/client";

export type WorkspaceVisualIdentity = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
  heroPattern: string;
  badgeLabel: string;
};

export const defaultWorkspaceVisualIdentity: WorkspaceVisualIdentity = {
  primaryColor: "#4374ba",
  accentColor: "#25c0d5",
  backgroundColor: "#f3f3f3",
  fontFamily: "system",
  heroPattern: "soft-grid",
  badgeLabel: "Perfil empresa"
};

const allowedFonts = new Set(["system", "display", "serif"]);
const allowedPatterns = new Set(["soft-grid", "topographic", "clean", "dark-panel"]);

export function isHexColor(value?: string | null) {
  return Boolean(value && /^#[0-9a-f]{6}$/i.test(value));
}

function settingsObject(settings: Prisma.JsonValue | null | undefined) {
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings as Prisma.JsonObject
    : {};
}

export function resolveWorkspaceVisualIdentity(settings: Prisma.JsonValue | null | undefined): WorkspaceVisualIdentity {
  const raw = settingsObject(settings).visualIdentity;
  const identity = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Prisma.JsonObject : {};

  const primaryColor = typeof identity.primaryColor === "string" && isHexColor(identity.primaryColor) ? identity.primaryColor : defaultWorkspaceVisualIdentity.primaryColor;
  const accentColor = typeof identity.accentColor === "string" && isHexColor(identity.accentColor) ? identity.accentColor : defaultWorkspaceVisualIdentity.accentColor;
  const backgroundColor = typeof identity.backgroundColor === "string" && isHexColor(identity.backgroundColor) ? identity.backgroundColor : defaultWorkspaceVisualIdentity.backgroundColor;
  const fontFamily = typeof identity.fontFamily === "string" && allowedFonts.has(identity.fontFamily) ? identity.fontFamily : defaultWorkspaceVisualIdentity.fontFamily;
  const heroPattern = typeof identity.heroPattern === "string" && allowedPatterns.has(identity.heroPattern) ? identity.heroPattern : defaultWorkspaceVisualIdentity.heroPattern;
  const badgeLabel = typeof identity.badgeLabel === "string" && identity.badgeLabel.trim() ? identity.badgeLabel.trim().slice(0, 42) : defaultWorkspaceVisualIdentity.badgeLabel;

  return { primaryColor, accentColor, backgroundColor, fontFamily, heroPattern, badgeLabel };
}

export function fontClassName(fontFamily: string) {
  if (fontFamily === "serif") return "font-serif";
  if (fontFamily === "display") return "font-display";
  return "";
}
