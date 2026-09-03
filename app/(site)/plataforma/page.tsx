import { BriefcaseBusiness, Fingerprint, Network, ShieldCheck } from "lucide-react";
import { TerraqoSectionPage } from "@/components/terraqo/terraqo-section-page";

export const metadata = { title: "Plataforma | Terraqo", description: "La arquitectura que conecta operación empresarial y trayectoria profesional sin mezclar su propiedad." };

export default function PlataformaPage() {
  return <TerraqoSectionPage eyebrow="Plataforma Terraqo" title="Una infraestructura común para operar, demostrar y conectar." intro="Terraqo mantiene separados los datos privados de cada empresa y la identidad independiente de cada profesional. Sólo comparte el contexto autorizado que permite trabajar mejor." sections={[
    { eyebrow: "Empresa", title: "Workspace operativo", description: "Clientes, proyectos, archivos, responsables y decisiones permanecen dentro de la organización y sus permisos.", icon: BriefcaseBusiness },
    { eyebrow: "Profesional", title: "Identidad independiente", description: "El perfil, las credenciales y el CV vivo pertenecen a la persona, incluso cuando colabora con distintas empresas.", icon: Fingerprint },
    { eyebrow: "Confianza", title: "Evidencia verificable", description: "Cada avance puede conservar autor, fecha, ubicación, archivos y validaciones sin revelar información privada.", icon: ShieldCheck },
    { eyebrow: "Mercado", title: "Red con contexto", description: "Las oportunidades nacen de capacidad demostrada, disponibilidad y relaciones profesionales autorizadas.", icon: Network },
  ]} closing="La empresa conserva su operación. La persona conserva su trayectoria. Terraqo conecta ambas con permisos explícitos." />;
}
