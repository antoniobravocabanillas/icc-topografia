import type { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { PublicationReviewConsole } from "@/components/terraqo/publication-review-console";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getWorkspaceForUser } from "@/lib/terraqo/workspace-access";
import { prisma } from "@/lib/prisma";
import {
  listPublicationReviews,
  publicationReviewEnabled,
} from "@/lib/terraqo/publication-review";

export const dynamic = "force-dynamic";
export default async function PublicationReviewsPage() {
  if (!publicationReviewEnabled()) notFound();
  const session = await requireAdminPage([
    "ADMIN",
    "SUPER_ADMIN",
    "COMMERCIAL_ADMIN",
  ]);
  const workspace = await getWorkspaceForUser(
    session.user.id,
    session.user.role as Role,
  );
  if (!workspace) notFound();
  const authority = await prisma.terraqoWorkspaceMember.findFirst({
    where: {
      workspaceId: workspace.id,
      userId: session.user.id,
      active: true,
      role: { in: ["OWNER", "ADMIN"] },
      workspace: { active: true, deletedAt: null },
    },
    select: { id: true },
  });
  if (!authority) notFound();
  const reviews = await listPublicationReviews(session.user.id, workspace.id);
  return (
    <PublicationReviewConsole
      canReview
      reviews={reviews.map((review) => ({
        ...review,
        revokedAt: review.revokedAt?.toISOString() || null,
      }))}
    />
  );
}
