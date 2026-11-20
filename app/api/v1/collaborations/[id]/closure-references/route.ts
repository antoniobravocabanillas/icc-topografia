import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/server/api";
import { listClosureReferenceCandidates } from "@/lib/terraqo/closure-reference-access";
import { noStore, referenceActor, referenceError, referenceId, referenceView } from "./access";

const query = z.object({ view: referenceView, limit: z.coerce.number().int().min(1).max(30).default(20), cursor: z.string().max(1200).optional() }).strict();
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.TERRAQO_CLOSURE_V1 !== "true") return noStore(fail("Recurso no disponible.", 404));
  try {
    const params = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const auth = await referenceActor(params.view);
    if (auth.response) return auth.response;
    const collaborationId = referenceId.parse((await context.params).id);
    return noStore(ok(await listClosureReferenceCandidates(prisma, { ...auth.actor!, collaborationId, limit: params.limit, cursor: params.cursor })));
  } catch (error) { return referenceError(error); }
}
