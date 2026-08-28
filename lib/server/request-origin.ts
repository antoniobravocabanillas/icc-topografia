const ALLOWED_HOSTS = new Set(["terraqoglobal.com", "www.terraqoglobal.com", "portal.terraqoglobal.com", "admin.terraqoglobal.com", "api.terraqoglobal.com", "localhost"]);

export function publicRequestOrigin(request: Request, fallback = "https://portal.terraqoglobal.com") {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  const directHost = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  const host = forwardedHost || directHost;
  if (!host || !ALLOWED_HOSTS.has(host.split(":")[0])) return fallback;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = host.startsWith("localhost") ? "http" : forwardedProto === "http" ? "http" : "https";
  return `${protocol}://${host}`;
}
