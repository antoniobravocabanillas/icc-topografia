import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const HOSTS = {
  public: "terraqoglobal.com",
  portal: "portal.terraqoglobal.com",
  api: "api.terraqoglobal.com",
  admin: "admin.terraqoglobal.com"
} as const;

function secure(response: NextResponse, request?: NextRequest) {
  const pathname = request?.nextUrl.pathname ?? "";
  const allowsSameOriginPreview =
    pathname.startsWith("/api/terraqo/professional-documents/") ||
    pathname.startsWith("/api/public/workspaces/");

  response.headers.set("X-Frame-Options", allowsSameOriginPreview ? "SAMEORIGIN" : "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

function requestHost(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? request.nextUrl.hostname;
  return host.split(",")[0]?.trim().split(":")[0]?.toLowerCase() ?? "";
}

function isSharedRoute(pathname: string) {
  return [
    "/api",
    "/cuenta",
    "/registro",
    "/reuniones",
    "/_next",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml"
  ].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function redirect(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return secure(NextResponse.redirect(url, 308), request);
}

function redirectToHost(request: NextRequest, host: string, pathname: string) {
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.hostname = host;
  url.port = "";
  url.pathname = pathname;
  return secure(NextResponse.redirect(url, 308), request);
}

function rewrite(request: NextRequest, pathname: string, surface: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-terraqo-surface", surface);
  const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  response.headers.set("X-Terraqo-Surface", surface);
  return secure(response, request);
}

export function middleware(request: NextRequest) {
  const host = requestHost(request);
  const { pathname } = request.nextUrl;

  if (host === HOSTS.public) {
    if (pathname === "/portal" || pathname.startsWith("/portal/")) {
      const cleanPath = pathname.slice("/portal".length) || "/";
      return redirectToHost(request, HOSTS.portal, cleanPath);
    }

    if (pathname === "/cuenta" || pathname.startsWith("/cuenta/") || pathname === "/registro" || pathname.startsWith("/registro/")) {
      return redirectToHost(request, HOSTS.portal, pathname);
    }

    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      return redirectToHost(request, HOSTS.admin, pathname);
    }
  }

  if (host === HOSTS.portal) {
    if (pathname === "/portal" || pathname.startsWith("/portal/")) {
      const cleanPath = pathname.slice("/portal".length) || "/";
      return redirect(request, cleanPath);
    }

    if (!isSharedRoute(pathname)) {
      const portalPath = pathname === "/" ? "/portal" : `/portal${pathname}`;
      return rewrite(request, portalPath, "portal");
    }
  }

  if (host === HOSTS.admin) {
    if (pathname === "/") {
      return rewrite(request, "/admin/terraqo", "admin");
    }

    const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
    if (!isAdminRoute && !isSharedRoute(pathname)) {
      return redirect(request, "/");
    }
  }

  if (host === HOSTS.api) {
    if (pathname === "/") {
      return rewrite(request, "/api/health", "api");
    }

    if (!pathname.startsWith("/api/")) {
      return rewrite(request, `/api${pathname}`, "api");
    }
  }

  return secure(NextResponse.next(), request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
