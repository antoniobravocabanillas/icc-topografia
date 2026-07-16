import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";

const memberships = [
  {
    audience: "Profesionales",
    name: "Free + Terraqo Pro",
    price: "Desde S/ 29 al mes",
    description: "Empieza con un perfil gratuito y activa CV vivo, portafolio, metricas y mas postulaciones cuando lo necesites.",
    features: ["Perfil y acceso a la red", "CV vivo y Worklog", "Oportunidades y validaciones"],
    href: "/registro"
  },
  {
    audience: "Empresas",
    name: "Workspace Lite",
    price: "Desde S/ 199 al mes",
    description: "Un espacio privado para proyectos, equipo, evidencias, reportes y seguimiento con modulos activables.",
    features: ["Proyectos y usuarios internos", "Bitacora, archivos y reportes", "Soporte y configuracion inicial"],
    href: "/#demo"
  },
  {
    audience: "Operaciones complejas",
    name: "Pro + Enterprise",
    price: "Configuracion a medida",
    description: "Permisos avanzados, multiples equipos, automatizaciones, integraciones, API y marca blanca.",
    features: ["Arquitectura por workspace", "Integraciones y API", "Onboarding y soporte dedicado"],
    href: "/#demo"
  }
];

export function TerraqoMemberships() {
  return (
    <section className="tq-memberships" id="membresias">
      <div className="tq-public-wrap">
        <p className="tq-section-number">07 / Membresias</p>
        <div className="tq-membership-heading">
          <h2>Entra gratis.<br />Activa capacidad cuando la necesitas.</h2>
          <p>Terraqo combina membresias profesionales y software por suscripcion para empresas. Cada plan amplia permisos, automatizacion y visibilidad sin mezclar los datos de distintos workspaces.</p>
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
        <p className="tq-membership-note"><Sparkles /> Certificaciones, Academy y servicios complementarios se activaran progresivamente dentro del mismo ecosistema.</p>
      </div>
    </section>
  );
}
