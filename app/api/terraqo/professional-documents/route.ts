import { requireUser } from "@/lib/server/authz";
import { uploadProfessionalDocuments } from "@/lib/server/professional-document-upload";

export async function POST(request: Request) {
  const { response, session } = await requireUser();
  if (response) return response;

  return uploadProfessionalDocuments(request, session.user.id);
}
