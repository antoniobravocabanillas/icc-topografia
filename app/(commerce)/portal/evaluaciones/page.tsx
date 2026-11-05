import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAssignedEvaluations } from "@/lib/terraqo/workspace-evaluators";
import { AssignedEvaluations } from "@/components/portal/assigned-evaluations";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Evaluaciones autorizadas", robots: { index: false, follow: false } };

export default async function AssignedEvaluationsPage() {
  if (process.env.TERRAQO_WORKSPACE_EVALUATORS_V1 !== "true") notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");
  // Reader access is independent of professional profiles and administrative membership.
  const evaluations = await listAssignedEvaluations(prisma, session.user.id);
  return <AssignedEvaluations evaluations={evaluations} />;
}
