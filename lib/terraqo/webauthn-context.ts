import { publicRequestOrigin } from "@/lib/server/request-origin";

export type WebAuthnContext = {
  rpId: string;
  expectedOrigin: string;
  rpName: string;
};

export class WebAuthnContextError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "WebAuthnContextError";
  }
}

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function resolveWebAuthnContext(input: {
  request: Request;
  workspace?: { domain: string | null; brandName: string | null; name: string } | null;
  portalOrigin?: string | null;
}) {
  // request.url can contain Netlify's internal deploy hostname even when the
  // browser is on portal.terraqoglobal.com. WebAuthn must always use the
  // public, allow-listed browser origin or the authenticator rejects the RP ID.
  let expectedOrigin = publicRequestOrigin(input.request);

  if (input.portalOrigin) {
    const portalUrl = new URL(input.portalOrigin);
    const workspaceDomain = input.workspace?.domain ? normalizeDomain(input.workspace.domain) : "";
    const portalDomain = normalizeDomain(portalUrl.hostname);
    const localDevelopment = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(portalUrl.hostname);
    const domainMatches = workspaceDomain && (portalDomain === workspaceDomain || portalDomain === `www.${workspaceDomain}` || `www.${portalDomain}` === workspaceDomain);
    if (!domainMatches && !localDevelopment) {
      throw new WebAuthnContextError("El dominio del portal no esta autorizado para validar identidad.");
    }
    expectedOrigin = portalUrl.origin;
  }

  const originUrl = new URL(expectedOrigin);
  return {
    expectedOrigin,
    rpId: originUrl.hostname,
    rpName: input.workspace?.brandName || input.workspace?.name || "Portal Terraqo",
  } satisfies WebAuthnContext;
}

export function compatibleWebAuthnRpIds(rpId: string) {
  if (rpId === "portal.terraqoglobal.com" || rpId === "admin.terraqoglobal.com") {
    return [rpId, "terraqoglobal.com"];
  }
  return [rpId];
}

export function selectCompatibleWebAuthnRpId(requestedRpId: string, availableRpIds: Iterable<string>) {
  const available = new Set(availableRpIds);
  return compatibleWebAuthnRpIds(requestedRpId).find((candidate) => available.has(candidate)) || null;
}
