import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { WorkspaceInvitationAccept } from "@/components/admin/workspace-invitation-accept";
export const dynamic = "force-dynamic";
export const metadata = { title: "Invitación al workspace", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function InvitationPage() {
  if (process.env.TERRAQO_WORKSPACE_INVITATIONS_V1 !== "true") notFound();
  const session = await auth();
  return <WorkspaceInvitationAccept signedIn={Boolean(session?.user?.id)} email={session?.user?.email || null} evaluatorsEnabled={process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 === "true"} />;
}
