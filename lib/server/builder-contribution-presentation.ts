import "server-only";
import type { Prisma } from "@prisma/client";

export const builderContributionSummarySelect = {
  id: true, type: true, status: true, title: true,
  requestedPoints: true, approvedPoints: true, createdAt: true,
} as const satisfies Prisma.TerraqoBuilderContributionSelect;

export const builderContributionAdminSelect = {
  ...builderContributionSummarySelect,
  detail: true, reviewNote: true,
  user: { select: { name: true, email: true, image: true } },
} as const satisfies Prisma.TerraqoBuilderContributionSelect;

type AdminContribution = Prisma.TerraqoBuilderContributionGetPayload<{ select: typeof builderContributionAdminSelect }>;

/** The reservation marker belongs to accounting. Never serialize it into a product view,
 * including malformed markers: presentation must not reveal an operation identifier.
 */
export function presentBuilderContribution(input: AdminContribution): AdminContribution {
  return {
    id: input.id, type: input.type, status: input.status, title: input.title,
    requestedPoints: input.requestedPoints, approvedPoints: input.approvedPoints, createdAt: input.createdAt,
    detail: input.detail.startsWith("native-first-worklog-v1:")
      ? "Aporte asociado a la primera bitácora profesional."
      : input.detail,
    reviewNote: input.reviewNote,
    user: { name: input.user.name, email: input.user.email, image: input.user.image },
  };
}
