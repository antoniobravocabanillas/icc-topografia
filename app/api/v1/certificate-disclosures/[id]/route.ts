import { auth } from "@/auth";
import { ok, fail } from "@/lib/server/api";
import { disclosureId, disclosureError, disclosureResponse } from "@/lib/server/certificate-disclosure-http";
import { readCertificateDisclosure, certificateDisclosureEnabled } from "@/lib/terraqo/certificate-disclosure";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!certificateDisclosureEnabled()) return disclosureResponse(fail("No disponible.", 404));
  try {
    const session = await auth();
    const result = await readCertificateDisclosure({ disclosureId: disclosureId.parse((await context.params).id), userId: session?.user?.id });
    return disclosureResponse(result ? ok(result) : fail("Constancia no disponible.", 404));
  } catch (error) { return disclosureError(error); }
}
