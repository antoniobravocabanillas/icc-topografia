const PUBLIC_HOSTS = [
  "terraqoglobal.com",
  "www.terraqoglobal.com",
  "portal.terraqoglobal.com",
  "admin.terraqoglobal.com",
  "api.terraqoglobal.com",
] as const;

const DEFAULT_PORTAL_ORIGIN = "https://portal.terraqoglobal.com";

function configuredOrigin(name: string, fallback?: string) {
  const value = process.env[name]?.trim() || fallback;
  if (!value) return null;
  try {
    const origin = new URL(value);
    return origin.protocol === "https:" || origin.protocol === "http:" ? origin.origin : null;
  } catch {
    return null;
  }
}

function allowedHosts() {
  const hosts = new Set<string>([...PUBLIC_HOSTS, "localhost"]);
  for (const name of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL"]) {
    const origin = configuredOrigin(name);
    if (origin) hosts.add(new URL(origin).hostname.toLowerCase());
  }
  return hosts;
}

function requestHost(value: string | null) {
  const candidate = value?.split(",")[0]?.trim().toLowerCase();
  if (!candidate) return null;
  try {
    const parsed = new URL(`https://${candidate}`);
    return { hostname: parsed.hostname.toLowerCase(), port: parsed.port };
  } catch {
    return null;
  }
}

export function publicRequestOrigin(
  request: Request,
  fallback = configuredOrigin("NEXT_PUBLIC_PORTAL_URL", DEFAULT_PORTAL_ORIGIN) || DEFAULT_PORTAL_ORIGIN,
) {
  const host = requestHost(request.headers.get("x-forwarded-host")) || requestHost(request.headers.get("host"));
  if (!host || !allowedHosts().has(host.hostname)) return fallback;
  const local = host.hostname === "localhost";
  const authority = `${host.hostname}${local && host.port ? `:${host.port}` : ""}`;
  return `${local ? "http" : "https"}://${authority}`;
}
