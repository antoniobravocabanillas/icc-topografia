import Link from "next/link";
import { ArrowRight, BellRing, Check, GitBranch, Mail, ShieldCheck, Webhook } from "lucide-react";

export const metadata = { title: "Automatización | Terraqo", description: "Automatizaciones Terraqo para seguimiento comercial, proyectos, talento y comunicación por suscripción." };

const plans = [
  { name: "Professional", scope: "Automatización esencial", flows: "5 flujos activos", runs: "1.000 ejecuciones / mes", features: ["Alertas y recordatorios", "Asignaciones por estado", "Correos transaccionales"] },
  { name: "Premium", scope: "Operación conectada", flows: "25 flujos activos", runs: "10.000 ejecuciones / mes", features: ["Condiciones y múltiples pasos", "CRM, proyectos y talento", "Plantillas por workspace"] },
  { name: "Enterprise", scope: "Orquestación avanzada", flows: "Flujos a medida", runs: "Capacidad acordada", features: ["Webhooks e integraciones", "Auditoría y gobierno", "Acompañamiento técnico"] },
];

export default function AutomatizacionPage() {
  return <div className="tq-detail-page tq-automation-page">
    <section className="tq-detail-hero"><div className="tq-public-wrap"><p className="tq-kicker">Automatización Terraqo</p><h1>Menos seguimiento manual. Más trabajo que avanza a tiempo.</h1><p>Activa reglas dentro de tu workspace para responder a eventos reales: un lead nuevo, una tarea vencida, una evidencia pendiente o un perfil incompleto.</p><div className="tq-detail-actions"><Link href="/membresias" className="tq-button tq-button-dark">Comparar planes <ArrowRight /></Link><Link href="/contacto?asunto=automatizacion-terraqo" className="tq-text-link">Diseñar un flujo <ArrowRight /></Link></div></div></section>
    <section className="tq-automation-flow"><div className="tq-public-wrap"><p className="tq-section-number">Así funciona</p><div className="tq-flow-line">{[
      [BellRing, "Evento", "Algo cambia en Terraqo"], [GitBranch, "Condición", "La regla evalúa contexto"], [Mail, "Acción", "Se informa o asigna"], [ShieldCheck, "Registro", "Todo queda auditado"]
    ].map(([Icon, title, text]) => { const FlowIcon = Icon as typeof BellRing; return <article key={String(title)}><FlowIcon /><small>{String(title)}</small><h2>{String(text)}</h2></article>; })}</div></div></section>
    <section className="tq-plan-comparison"><div className="tq-public-wrap"><div className="tq-membership-heading"><h2>Automatización que crece con la operación.</h2><p>El módulo se habilita para todo el workspace desde Professional. Los límites controlan complejidad y volumen, no el acceso arbitrario de cada integrante.</p></div><div className="tq-plan-grid">{plans.map((plan) => <article key={plan.name}><small>{plan.scope}</small><h2>{plan.name}</h2><strong>{plan.flows}</strong><p>{plan.runs}</p><ul>{plan.features.map((feature) => <li key={feature}><Check />{feature}</li>)}</ul><Link href={`/contacto?asunto=plan-${plan.name.toLowerCase()}`}>Solicitar este plan <ArrowRight /></Link></article>)}</div><p className="tq-entitlement-note"><Webhook /> Las automatizaciones se activan por suscripción para el workspace completo y se deshabilitan automáticamente cuando el plan deja de incluirlas.</p></div></section>
  </div>;
}
