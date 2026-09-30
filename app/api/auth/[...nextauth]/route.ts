import { NextRequest } from "next/server";
import { handlers } from "@/auth";

const productionAuthHosts = new Set([
  "portal.terraqoglobal.com",
  "admin.terraqoglobal.com",
]);

function publicOrigin(request: NextRequest) {
  const candidates = [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
  ];

  for (const candidate of candidates) {
    const host = candidate?.split(",")[0]?.trim();
    if (!host) continue;
    const hostname = host.replace(/:\d+$/, "").toLowerCase();
    if (productionAuthHosts.has(hostname)) return `https://${host}`;
    if (process.env.NODE_ENV !== "production" && (hostname === "localhost" || hostname === "127.0.0.1")) {
      return `http://${host}`;
    }
  }

  return null;
}

async function normalizeAuthRequest(request: NextRequest) {
  const origin = publicOrigin(request);
  if (!origin) return request;

  const incomingUrl = new URL(request.url);
  const publicUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, origin);
  if (incomingUrl.origin === publicUrl.origin) return request;

  const headers = new Headers(request.headers);
  headers.set("host", publicUrl.host);
  headers.set("x-forwarded-host", publicUrl.host);
  headers.set("x-forwarded-proto", publicUrl.protocol.slice(0, -1));

  return new NextRequest(publicUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
  });
}

export async function GET(request: NextRequest) {
  return handlers.GET(await normalizeAuthRequest(request));
}

export async function POST(request: NextRequest) {
  return handlers.POST(await normalizeAuthRequest(request));
}
