import { requireUser } from "@/lib/server/authz";
import { deletePrivateNote, updatePrivateNote } from "@/lib/server/private-workspace-storage";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { response, session } = await requireUser();
  if (response) return response;
  return updatePrivateNote(request, session.user.id, (await params).id);
}

export async function DELETE(_: Request, { params }: Context) {
  const { response, session } = await requireUser();
  if (response) return response;
  return deletePrivateNote(session.user.id, (await params).id);
}
