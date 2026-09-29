import { redirect } from "next/navigation";
import Image from "next/image";
import { auth } from "@/auth";
import { AccountAccessPanel } from "@/components/auth/account-access-panel";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";
import { terraqoDomains } from "@/lib/terraqo-domains";
import { billingContinuation } from "@/lib/terraqo/billing/continuation";

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
      <a href="https://terraqoglobal.com" className="tq-auth-brand" aria-label="Ir al inicio de Terraqo">
        <TerraqoLogo variant="horizontal" tone="dark" className="h-11 w-[210px]" />
      </a>
      <div className="tq-auth-language" aria-label="Idioma actual">Español</div>
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
            socialProviders={{
              google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
              apple: Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET),
              microsoft: Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET),
            }}
          />
        </div>
      </div>
    </section>
  );
}
