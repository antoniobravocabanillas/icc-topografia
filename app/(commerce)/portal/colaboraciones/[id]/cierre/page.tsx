import { notFound } from "next/navigation";
import { ClosurePanel } from "@/components/terraqo/closure-panel";
import { listCollaborations } from "@/lib/terraqo/collaboration";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";

export default async function ProfessionalClosurePage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requireProfessionalPortal();
  if (process.env.TERRAQO_COLLABORATION_V1 !== "true" || process.env.TERRAQO_CLOSURE_V1 !== "true") notFound();
  const { id } = await params;
  const collaborations = await listCollaborations({ userId: session.user.id, collaborationId: id });
  const collaboration = collaborations.find((item) => item.id === id);
  if (!collaboration || collaboration.professionalUserId !== session.user.id || collaboration.acceptedRevisionNo == null || !collaboration.closure) notFound();
  return <ClosurePanel key={id} mode="professional" collaborationId={id} presentation="dedicated" />;
}
