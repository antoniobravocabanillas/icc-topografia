import { notFound } from "next/navigation";
import { PublicWorkCaseView } from "@/components/terraqo/public-cv-work-cases";
import { publicWorkCase } from "@/lib/terraqo/public-work-case";

export const dynamic = "force-dynamic";
export default async function WorkCasePage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  const work = await publicWorkCase(username, slug);
  if (!work) notFound();
  return <PublicWorkCaseView username={username} work={work} />;
}
