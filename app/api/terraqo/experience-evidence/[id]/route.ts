import { requireUser } from "@/lib/server/authz";
import { getExperienceEvidenceFile } from "@/lib/server/experience-evidence";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  const { response, session } = await requireUser();
  if (response) return response;
  return getExperienceEvidenceFile(session.user.id, (await params).id);
}
