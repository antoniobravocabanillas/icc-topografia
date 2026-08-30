import type { ReactNode } from "react";

import { auth } from "@/auth";
import { PortalShell } from "@/components/portal/portal-shell";
import { SessionPresence } from "@/components/auth/session-presence";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceVisualIdentity } from "@/lib/terraqo/workspace-visual-identity";

export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          name: true,
          image: true,
          terraqoProfessionalProfile: {
            select: { headline: true, planTier: true },
          },
          terraqoBuilderAccount: { select: { premiumUntil: true } },
          terraqoMemberships: {
            where: {
              active: true,
              workspace: { active: true, deletedAt: null },
            },
            orderBy: { joinedAt: "desc" },
            take: 1,
            select: {
              role: true,
              workspace: {
                select: {
                  name: true,
                  brandName: true,
                  logoUrl: true,
                  settings: true,
                  modules: {
                    where: { code: "AI_WRITING_ASSISTANT", active: true },
                    select: { code: true },
                  },
                  subscriptions: {
                    where: { status: { in: ["TRIALING", "ACTIVE"] } },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { tier: true },
                  },
                },
              },
            },
          },
        },
      })
    : null;
  const membership = user?.terraqoMemberships[0];
  const portalType = user?.terraqoProfessionalProfile
    ? "professional"
    : membership
      ? "client"
      : "professional";
  const writingAssistantEnabled = Boolean(membership?.workspace.modules.length);
  const visualIdentity = resolveWorkspaceVisualIdentity(
    portalType === "professional" ? null : membership?.workspace.settings,
  );

  return (
    <>
      <SessionPresence />
      <PortalShell
        currentUserId={session?.user?.id || ""}
        name={user?.name || session?.user?.name}
        image={user?.image}
        headline={user?.terraqoProfessionalProfile?.headline}
        portalType={portalType}
        workspaceBrand={
          membership?.workspace.brandName || membership?.workspace.name
        }
        workspaceLogoUrl={membership?.workspace.logoUrl}
        planTier={
          portalType === "professional"
            ? user?.terraqoBuilderAccount?.premiumUntil &&
              user.terraqoBuilderAccount.premiumUntil > new Date()
              ? "PREMIUM"
              : user?.terraqoProfessionalProfile?.planTier
            : membership?.workspace.subscriptions[0]?.tier || "FREE"
        }
        visualIdentity={visualIdentity}
        writingAssistantEnabled={writingAssistantEnabled}
      >
        {children}
      </PortalShell>
    </>
  );
}
