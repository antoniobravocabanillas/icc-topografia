import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getWorklogEvidenceStore } from "@/lib/server/media";
import { closureReferenceMediaResponse } from "@/lib/server/closure-reference-media";
import { resolveClosureReferenceMedia } from "@/lib/terraqo/closure-reference-access";
import { TerraqoMessagingError } from "@/lib/terraqo/messaging";
import { terraqoClosureReferenceSourceSchema } from "@/lib/validations/terraqo";
import { noStore, referenceActor, referenceError, referenceId, referenceView } from "../../../access";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Identical saved/candidate descriptor shape to the detail endpoint. No client
// workspace, storage key or grant can widen this boundary.
const query = z.object({ view: referenceView, referenceId: z.string().cuid().optional(),
  accessKind: z.enum(["PUBLIC_CV", "PUBLIC_SELECTION"]).optional(), accessReferenceId: z.string().cuid().optional(),
}).strict().refine(value => value.referenceId ? !value.accessKind && !value.accessReferenceId : Boolean(value.accessKind && value.accessReferenceId));

export async function GET(request: Request, context: { params: Promise<{ id: string; revisionId: string; mediaId: string }> }) {
  try {
    if (process.env.TERRAQO_CLOSURE_V1 !== "true") throw new TerraqoMessagingError("Referencia no disponible.", 404);
    const params = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const path = await context.params;
    const collaborationId = referenceId.parse(path.id), revisionId = z.string().cuid().parse(path.revisionId);
    const mediaId = z.string().cuid().parse(path.mediaId);
    const source = params.referenceId ? undefined : terraqoClosureReferenceSourceSchema.parse({
      worklogRevisionId: revisionId, accessKind: params.accessKind, accessReferenceId: params.accessReferenceId,
    });
    return noStore(await closureReferenceMediaResponse(request, {
      authorize: async () => {
        if (process.env.TERRAQO_CLOSURE_V1 !== "true") throw new TerraqoMessagingError("Referencia no disponible.", 404);
        const auth = await referenceActor(params.view);
        if (auth.response) throw new TerraqoMessagingError("Sesión requerida.", auth.response.status);
        return resolveClosureReferenceMedia(prisma, { ...auth.actor!, collaborationId, revisionId, mediaId, referenceId: params.referenceId, source });
      },
      loadBlob: key => getWorklogEvidenceStore().getWithMetadata(key, { type: "arrayBuffer" }),
    }));
  } catch (error) { return referenceError(error); }
}
