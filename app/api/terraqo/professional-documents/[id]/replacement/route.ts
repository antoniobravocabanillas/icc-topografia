import { documentLifecycleMutation } from "@/lib/server/document-lifecycle-http";

export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return documentLifecycleMutation(request, (await params).id, "replace");
}
