import { ok, fail } from "@/lib/server/api";
import { disclosureActor, disclosureId, disclosureError, disclosureMutation, disclosureResponse } from "@/lib/server/certificate-disclosure-http";
import { certificateDisclosureEnabled, decideCertificateDisclosure } from "@/lib/terraqo/certificate-disclosure";
export async function POST(request: Request, context: { params: Promise<{ id: string; disclosureId: string }> }) {
  if (!certificateDisclosureEnabled()) return disclosureResponse(fail("No disponible.", 404));
  try {
    const ids = await context.params;
    const actor = await disclosureActor(request, disclosureId.parse(ids.id));
    return disclosureResponse(ok(await decideCertificateDisclosure({ ...actor, disclosureId: disclosureId.parse(ids.disclosureId), ...await disclosureMutation(request) })));
  } catch (error) { return disclosureError(error); }
}
