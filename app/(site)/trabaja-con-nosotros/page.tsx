import { WorkspaceCareerForm } from "@/components/careers/workspace-career-form";
import { createMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = createMetadata({
  title: "Trabaja con nosotros",
  description: "Postula a ICC Topografia y crea tu perfil profesional privado en Portal Terraqo.",
  path: "/trabaja-con-nosotros"
});

export default function WorkWithUsPage() {
  return <WorkspaceCareerForm workspaceSlug="icc-topografia" />;
}
