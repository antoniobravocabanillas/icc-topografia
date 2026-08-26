import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountAccessPanel } from "@/components/auth/account-access-panel";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";
import { terraqoDomains } from "@/lib/terraqo-domains";

export const metadata = createMetadata({ title: "Portal Terraqo", description: "Acceso a clientes, profesionales y equipo operativo de Terraqo.", path: "/cuenta" });

const workspaceAdminRoles = new Set(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);

function resolveAccessDestination(role?: string | null) {
  if (role === "SUPER_ADMIN") return `${terraqoDomains.admin}/admin/terraqo`;
  if (role && workspaceAdminRoles.has(role)) return `${terraqoDomains.admin}/admin`;
  return `${terraqoDomains.portal}/portal`;
}

type AccountPageProps = {
  searchParams: Promise<{ workspace?: string }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const session = await auth();
  if (session?.user) redirect(resolveAccessDestination(session.user.role));

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
    <section className="tq-auth-surface relative isolate min-h-[calc(100vh-81px)] overflow-hidden bg-[#0e1a26] text-white">
      <div className="tq-auth-atmosphere" aria-hidden="true" />
      <div className="tq-auth-layout">
        <div className="tq-auth-story">
          <div className="tq-auth-copy">
            <p className="tq-auth-kicker">{isWorkspacePortal ? `Portal ${brandName}` : "Portal Terraqo"}</p>
            {workspace?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={workspace.logoUrl} alt={brandName} className="mt-5 h-12 max-w-[220px] object-contain object-left" />
            ) : null}
            <h1>
              {isWorkspacePortal ? (
                <>Tu operación, conectada a <span>{brandName}</span>.</>
              ) : (
                <>Un solo acceso para <span>empresas</span>, <span>profesionales</span> y <span>equipos</span> operativos.</>
              )}
            </h1>
            <p className="tq-auth-lead">
              {isWorkspacePortal
                ? "Entra al espacio asignado a tu organización con identidad, permisos y datos aislados."
                : "Proyectos, capacidades y evidencia conviven en una red que transforma actividad real en confianza y nuevas oportunidades."}
            </p>
          </div>

          <div className="tq-auth-principles" aria-label="Principios del Portal Terraqo">
            <div><b>01</b><strong>Identidad confiable</strong><span>Perfiles y organizaciones con contexto verificable.</span></div>
            <div><b>02</b><strong>Operación conectada</strong><span>Personas, proyectos y herramientas bajo un mismo entorno.</span></div>
            <div><b>03</b><strong>Evidencia que crece</strong><span>El trabajo realizado alimenta reputación y oportunidades.</span></div>
          </div>
        </div>

        <div className="tq-auth-panel-wrap">
          <AccountAccessPanel
            loginTitle={isWorkspacePortal ? `Bienvenido a ${brandName}` : undefined}
            loginDescription={isWorkspacePortal ? "Usa tus credenciales Terraqo para ingresar al espacio asignado." : undefined}
          />
        </div>
      </div>
    </section>
  );
}
