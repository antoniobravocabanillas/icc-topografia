import { BriefcaseBusiness, FileCheck2, Network, UserRoundCheck } from "lucide-react";
import { TerraqoProductShowcase } from "@/components/terraqo/terraqo-product-showcase";
import { TerraqoSectionPage } from "@/components/terraqo/terraqo-section-page";

export const metadata = { title: "Producto | Terraqo", description: "Producto modular para empresas y profesionales: operación, evidencia, red y oportunidades." };

export default function ProductoPage() {
  return <><TerraqoSectionPage eyebrow="Producto modular" title="Activa capacidades sin fragmentar tu operación." intro="Un sistema coherente para gestionar trabajo, convertirlo en evidencia y abrir oportunidades. Cada módulo respeta el plan, el workspace y los permisos del usuario." sections={[
    { eyebrow: "Gestión", title: "Operaciones conectadas", description: "CRM, proyectos, documentos, equipos y comunicación comparten responsables y trazabilidad.", icon: BriefcaseBusiness },
    { eyebrow: "Worklog", title: "Trabajo documentado", description: "Procesos, entregas y resultados forman una línea de tiempo útil para empresas y profesionales.", icon: FileCheck2 },
    { eyebrow: "Perfil", title: "CV vivo", description: "La experiencia deja de ser una declaración estática y se construye con evidencia y validaciones.", icon: UserRoundCheck },
    { eyebrow: "Red", title: "Oportunidades relevantes", description: "Personas, empresas y equipos se encuentran por capacidad, contexto y disponibilidad.", icon: Network },
  ]} closing="Un solo producto, múltiples capacidades y una fuente confiable de contexto para cada decisión." /><TerraqoProductShowcase /></>;
}
