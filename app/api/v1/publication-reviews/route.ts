import { requireUser } from "@/lib/server/authz";
import { publicationReviewHandlers } from "@/lib/server/publication-review-http";
import {
  publicationReviewEnabled,
  listPublicationReviews,
  requestPublicationReviews,
  decidePublicationReview,
  revokePublicationReview,
} from "@/lib/terraqo/publication-review";

export const dynamic = "force-dynamic";
const handler = publicationReviewHandlers({
  enabled: publicationReviewEnabled,
  authenticate: async () => {
    const { session } = await requireUser();
    return session ? { userId: session.user.id } : null;
  },
  list: listPublicationReviews,
  request: requestPublicationReviews,
  decide: decidePublicationReview,
  revoke: revokePublicationReview,
});
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
