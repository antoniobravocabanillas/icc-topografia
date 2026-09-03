import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";

const memberships = [
  {
    audience: "Profesionales",
    name: "Free + Terraqo Pro",
    price: "Desde S/ 29 al mes",
    description: "Empieza con un perfil gratuito y activa CV vivo, portafolio, métricas y más postulaciones cuando lo necesites.",
    features: ["Perfil y acceso a la red", "CV vivo y Worklog", "Oportunidades y validaciones"],
    href: "/registro"
  },
  {
    audience: "Empresas",
    name: "Workspace Lite",
    price: "Desde S/ 199 al mes",
    description: "Un espacio privado para proyectos, equipo, evidencias, reportes y seguimiento con módulos activables.",
    features: ["Proyectos y usuarios internos", "Bitácora, archivos y reportes", "Automatización desde Professional"],
    href: "/contacto?asunto=workspace-terraqo"
  },
  {
    audience: "Operaciones complejas",
    name: "Pro + Enterprise",
    price: "Configuración a medida",
    description: "Permisos avanzados, múltiples equipos, automatizaciones, integraciones, API y marca blanca.",
    features: ["Arquitectura por workspace", "Integraciones y API", "Onboarding y soporte dedicado"],
    href: "/contacto?asunto=enterprise-terraqo"
  }
];

export function TerraqoMemberships() {
  return (
    <section className="tq-memberships" id="membresias">
      <div className="tq-public-wrap">
        <p className="tq-section-number">06 / Membresías</p>
        <div className="tq-membership-heading">
          <h2>Entra gratis.<br />Activa capacidad cuando la necesitas.</h2>
          <p>Terraqo combina membresías profesionales y software por suscripción para empresas. Cada plan amplía permisos, automatización y visibilidad sin mezclar los datos de distintos workspaces.</p>
        </div>

        <div className="tq-membership-list">
          {memberships.map((membership, index) => (
            <article key={membership.name}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div className="tq-membership-name"><small>{membership.audience}</small><h3>{membership.name}</h3></div>
              <p>{membership.description}</p>
              <ul>{membership.features.map((feature) => <li key={feature}><Check /> {feature}</li>)}</ul>
              <div className="tq-membership-action"><strong>{membership.price}</strong><Link href={membership.href}>Conocer el plan <ArrowRight /></Link></div>
            </article>
          ))}
        </div>
        <p className="tq-membership-note"><Sparkles /> Automatización, certificaciones, Academy y servicios complementarios se activan dentro del mismo ecosistema según el plan contratado.</p>
      </div>
    </section>
  );
}
