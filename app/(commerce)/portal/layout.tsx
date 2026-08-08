import type { ReactNode } from "react";

import { auth } from "@/auth";
import { PortalShell } from "@/components/portal/portal-shell";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceVisualIdentity } from "@/lib/terraqo/workspace-visual-identity";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const defaultWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          name: true,
          image: true,
          terraqoProfessionalProfile: { select: { headline: true } },
          terraqoMemberships: {
            where: { active: true, ...(defaultWorkspaceId ? { workspaceId: defaultWorkspaceId } : {}) },
            orderBy: { joinedAt: "desc" },
            take: 1,
            select: {
              role: true,
              workspace: { select: { name: true, brandName: true, logoUrl: true, settings: true } }
            }
          }
        }
      })
    : null;
  const membership = user?.terraqoMemberships[0];
  const portalType = user?.terraqoProfessionalProfile ? "professional" : membership?.role === "CLIENT" ? "client" : "professional";
  const visualIdentity = resolveWorkspaceVisualIdentity(membership?.workspace.settings);

  return (
    <PortalShell
      name={user?.name || session?.user?.name}
      image={user?.image}
      headline={user?.terraqoProfessionalProfile?.headline}
      portalType={portalType}
      workspaceBrand={membership?.workspace.brandName || membership?.workspace.name}
      workspaceLogoUrl={membership?.workspace.logoUrl}
      visualIdentity={visualIdentity}
    >
      {children}
    </PortalShell>
  );
}
