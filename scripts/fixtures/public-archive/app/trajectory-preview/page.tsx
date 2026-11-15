import { TrajectoryActions } from "@/components/terraqo/trajectory-actions";
import { WorkspaceInvitationAccept } from "@/components/admin/workspace-invitation-accept";
export default async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; invite?: string }>;
}) {
  const q = await searchParams;
  return (
    <main className="mx-auto max-w-5xl p-4">
      {q.invite ? (
        <WorkspaceInvitationAccept signedIn={false} email={null} />
      ) : (
        <TrajectoryActions
          profileId={q.profile || "test"}
          workCases={true}
          endorsements={true}
        />
      )}
    </main>
  );
}
