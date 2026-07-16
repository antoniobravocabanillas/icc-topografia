import type { ReactNode } from "react";

import { auth } from "@/auth";
import { PortalShell } from "@/components/portal/portal-shell";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          name: true,
          image: true,
          terraqoProfessionalProfile: { select: { headline: true } }
        }
      })
    : null;

  return (
    <PortalShell
      name={user?.name || session?.user?.name}
      image={user?.image}
      headline={user?.terraqoProfessionalProfile?.headline}
      portalType={user?.terraqoProfessionalProfile ? "professional" : "client"}
    >
      {children}
    </PortalShell>
  );
}
