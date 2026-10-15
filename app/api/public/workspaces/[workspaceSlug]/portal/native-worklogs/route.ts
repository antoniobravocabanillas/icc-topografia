import { handleNativeWorklogPortal } from "@/lib/server/native-worklog-portal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ workspaceSlug: string }> };

async function handle(request: Request, context: Context) {
  const { workspaceSlug } = await context.params;
  return handleNativeWorklogPortal(request, workspaceSlug);
}

export const GET = handle;
export const POST = handle;
