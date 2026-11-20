import { ok, created, fail } from "@/lib/server/api";
import { disclosureActor, disclosureId, disclosureError, disclosureMutation, disclosureResponse } from "@/lib/server/certificate-disclosure-http";
import { certificateDisclosureEnabled, listCertificateDisclosures, createCertificateDisclosure } from "@/lib/terraqo/certificate-disclosure";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  if (!certificateDisclosureEnabled()) return disclosureResponse(fail("No disponible.", 404));
  try { return disclosureResponse(ok(await listCertificateDisclosures(await disclosureActor(request, disclosureId.parse((await context.params).id))))); }
  catch (error) { return disclosureError(error); }
}
export async function POST(request: Request, context: Context) {
  if (!certificateDisclosureEnabled()) return disclosureResponse(fail("No disponible.", 404));
  try {
    const actor = await disclosureActor(request, disclosureId.parse((await context.params).id));
    return disclosureResponse(created(await createCertificateDisclosure({ ...actor, ...await disclosureMutation(request) })));
  } catch (error) { return disclosureError(error); }
}
