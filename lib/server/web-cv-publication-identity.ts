import "server-only";
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CvPublicationError, type WebCvPublicationIdentity } from "./portal-cv-publication";
import { webCvSessionClaims } from "./web-cv-session-grant";

export async function webCvPublicationIdentity(request: Request, workspaceSlug: string): Promise<WebCvPublicationIdentity> {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new CvPublicationError("La sesión no está disponible.", 503);
  const secure = process.env.NODE_ENV === "production";
  // Read only the encrypted, signed session cookie. getToken's Bearer fallback
  // is deliberately excluded: this endpoint is tied to the web session.
  const cookieRequest = new Request(request.url, { headers: { cookie: request.headers.get("cookie") || "" } });
  const jwt = await getToken({ req: cookieRequest, secret, secureCookie: secure,
    cookieName: secure ? "__Secure-authjs.session-token" : "authjs.session-token" });
  const claims = webCvSessionClaims(jwt);
  if (!claims) throw new CvPublicationError("Inicia sesión nuevamente para administrar la publicación del CV.", 401);
  const session = await auth();
  if (!session?.user?.id || session.user.id !== claims.userId)
    throw new CvPublicationError("La sesión no es válida.", 401);
  const membership = await prisma.terraqoWorkspaceMember.findFirst({ where: {
    userId: claims.userId, active: true, role: "PROFESSIONAL",
    workspace: { slug: workspaceSlug, active: true, deletedAt: null },
  }, select: { workspaceId: true } });
  if (!membership) throw new CvPublicationError("Tu acceso profesional cambió.", 403);
  // This lookup selects the requested context, not durable authorization. The
  // shared service rechecks it under locks with owner/module/billing and grant.
  return { source: "web", sub: claims.userId, role: "PROFESSIONAL", workspaceId: membership.workspaceId,
    workspaceSlug, exp: claims.expires, sessionId: claims.sessionId };
}
