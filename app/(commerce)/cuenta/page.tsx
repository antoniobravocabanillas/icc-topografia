import { redirect } from "next/navigation";
import Image from "next/image";
import { auth, signOut } from "@/auth";
import { AccountAccessPanel } from "@/components/auth/account-access-panel";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";
import { terraqoDomains } from "@/lib/terraqo-domains";
import { billingContinuation } from "@/lib/terraqo/billing/continuation";
import { resolveOAuthProviderAvailability } from "@/lib/server/oauth-provider-policy";
import { hasWorkspaceAdminAccess } from "@/lib/terraqo/workspace-access";

export const metadata = createMetadata({ title: "Accede a Terraqo", description: "Inicia sesión como profesional o empresa y continúa tu operación en Terraqo.", path: "/cuenta" });

const workspaceAdminRoles = new Set(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);

function resolveAccessDestination(role?: string | null) {
  if (role === "SUPER_ADMIN") return `${terraqoDomains.admin}/admin/terraqo`;
  if (role && workspaceAdminRoles.has(role)) return `${terraqoDomains.admin}/admin`;
  return `${terraqoDomains.portal}/portal`;
}

type AccountPageProps = {
  searchParams: Promise<{ workspace?: string; callbackUrl?: string }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const session = await auth();
  // A signed-in role is not proof of an active workspace membership. Avoid the
  // account -> admin -> account redirect loop after access is revoked.
  if (session?.user && workspaceAdminRoles.has(session.user.role || "") && !await hasWorkspaceAdminAccess(session.user.id)) {
    return <section className="mx-auto flex min-h-[65vh] max-w-xl items-center px-5 py-12">
      <div className="w-full space-y-5 rounded-xl border bg-background p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Tu acceso a la empresa no está activo</h1>
        <p className="text-sm leading-6 text-muted-foreground">Tu sesión sigue abierta, pero no tienes una membresía activa para entrar al panel. Pide al administrador de tu empresa que revise tu acceso.</p>
        <div className="flex flex-wrap items-center gap-3">
          <form action={async () => {
            "use server";
            // Keep this recovery exit usable before hydration. Auth.js clears
            // the session cookie and revokes the CV grant on the server.
            await signOut({ redirectTo: "/cuenta" });
          }}>
            <button type="submit" className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Cerrar sesión</button>
          </form>
          <form method="get" action="/cuenta"><button type="submit" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Volver a comprobar</button></form>
        </div>
      </div>
    </section>;
  }
  if (session?.user) redirect(billingContinuation(params.callbackUrl)?`${terraqoDomains.portal}${billingContinuation(params.callbackUrl)}`:resolveAccessDestination(session.user.role));

  const workspaceSlug = params.workspace?.trim();
  const workspace = workspaceSlug
    ? await prisma.terraqoWorkspace.findFirst({
        where: { slug: workspaceSlug, active: true, deletedAt: null },
        select: { name: true, brandName: true, logoUrl: true },
      })
    : null;
  const brandName = workspace?.brandName || workspace?.name || "Terraqo";
  const isWorkspacePortal = Boolean(workspace);
  const socialProviders = resolveOAuthProviderAvailability();

  return (
    <section className="tq-auth-surface tq-auth-surface--editorial relative isolate min-h-dvh overflow-hidden bg-[#07101a] text-white">
      <Image
        src="/images/terraqo/bgimagen.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="tq-auth-background"
        aria-hidden="true"
      />
      <div className="tq-auth-editorial-shade" aria-hidden="true" />
      <div className="tq-auth-layout">
        <div className="tq-auth-story">
          <div className="tq-auth-copy">
            <span className="tq-auth-story-rule" aria-hidden="true" />
            <p className="tq-auth-kicker">{isWorkspacePortal ? `Portal ${brandName}` : "Trabajo real · oportunidades reales"}</p>
            {workspace?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={workspace.logoUrl} alt={brandName} className="mt-5 h-12 max-w-[220px] object-contain object-left" />
            ) : null}
            <h1>
              {isWorkspacePortal ? (
                <>Tu operación, conectada a <span>{brandName}</span>.</>
              ) : (
                <>Tu trabajo <span>conecta</span> nuevas oportunidades.</>
              )}
            </h1>
            <p className="tq-auth-lead">
              {isWorkspacePortal
                ? "Entra al espacio asignado a tu organización con identidad, permisos y datos aislados."
                : "Terraqo es la infraestructura digital para operar, validar y conectar el trabajo técnico."}
            </p>
          </div>

          <div className="tq-auth-principles" aria-label="Ecosistema Terraqo">
            <span>Profesionales</span><i aria-hidden="true" /><span>Empresas</span><i aria-hidden="true" /><span>Proyectos</span><i aria-hidden="true" /><span>Evidencia</span>
          </div>
        </div>

        <div className="tq-auth-panel-wrap">
          <AccountAccessPanel
            loginTitle={isWorkspacePortal ? `Bienvenido a ${brandName}` : undefined}
            loginDescription={isWorkspacePortal ? "Usa tus credenciales Terraqo para ingresar al espacio asignado." : undefined}
            socialProviders={socialProviders}
          />
        </div>
      </div>
    </section>
  );
}
