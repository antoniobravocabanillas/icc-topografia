import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/server/api";
import { getClosureReferenceDetail } from "@/lib/terraqo/closure-reference-access";
import { terraqoClosureReferenceSourceSchema } from "@/lib/validations/terraqo";
import { noStore, referenceActor, referenceError, referenceId, referenceView } from "../access";

const query = z.object({ view: referenceView, referenceId: z.string().cuid().optional(),
  accessKind: z.enum(["PUBLIC_CV", "PUBLIC_SELECTION"]).optional(), accessReferenceId: z.string().cuid().optional(),
}).strict().refine(value => value.referenceId ? !value.accessKind && !value.accessReferenceId : Boolean(value.accessKind && value.accessReferenceId));
export async function GET(request: Request, context: { params: Promise<{ id: string; revisionId: string }> }) {
  if (process.env.TERRAQO_CLOSURE_V1 !== "true") return noStore(fail("Recurso no disponible.", 404));
  try {
    const params = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const auth = await referenceActor(params.view);
    if (auth.response) return auth.response;
    const path = await context.params;
    const collaborationId = referenceId.parse(path.id), revisionId = z.string().cuid().parse(path.revisionId);
    const source = params.referenceId ? undefined : terraqoClosureReferenceSourceSchema.parse({
      worklogRevisionId: revisionId, accessKind: params.accessKind, accessReferenceId: params.accessReferenceId,
    });
    return noStore(ok(await getClosureReferenceDetail(prisma, { ...auth.actor!, collaborationId, revisionId, referenceId: params.referenceId, source })));
  } catch (error) { return referenceError(error); }
}
