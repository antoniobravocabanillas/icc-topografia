import { MembershipExplorer } from "@/components/terraqo/membership-explorer";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ title: "Membresías", description: "Compara membresías personales y planes de empresa. Consulta módulos, alcance y capacidades de Terraqo.", path: "/membresias" });

export default function MembresiasPage() { return <MembershipExplorer/>; }
