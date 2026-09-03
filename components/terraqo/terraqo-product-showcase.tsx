"use client";

import { useState } from "react";
import { BadgeCheck, BriefcaseBusiness, Check, FileCheck2, FolderKanban, MapPin, Network, Search, ShieldCheck, UsersRound } from "lucide-react";

const views = [
  { id: "profile", index: "01", label: "Perfil profesional", title: "La trayectoria se construye con evidencia.", description: "Experiencia, bitácoras y validaciones bajo control de cada profesional." },
  { id: "workspace", index: "02", label: "Workspace empresarial", title: "La operación conserva responsables y contexto.", description: "Proyectos, clientes, archivos y conversaciones dentro de cada organización." },
  { id: "network", index: "03", label: "Red profesional", title: "Las oportunidades parten de capacidad demostrada.", description: "Descubrimiento y conexión con permisos, disponibilidad y trabajo visible." },
] as const;

type ViewId = (typeof views)[number]["id"];

export function TerraqoProductShowcase() {
  const [active, setActive] = useState<ViewId>("profile");
  const selected = views.find((view) => view.id === active) || views[0];
  return (
    <section className="tq-product-showcase" id="producto">
      <div className="tq-public-wrap">
        <p className="tq-section-number">02 / Producto</p>
        <div className="tq-product-heading"><h2>Un mismo sistema.<br /><em>Tres espacios de trabajo.</em></h2><p>No son productos aislados. Perfil, empresa y red comparten identidad y contexto, respetando los límites de acceso de cada espacio.</p></div>
        <div className="tq-product-console">
          <nav aria-label="Vistas del producto Terraqo" className="tq-product-tabs">
            {views.map((view) => <button key={view.id} type="button" aria-pressed={active === view.id} onClick={() => setActive(view.id)}><span>{view.index}</span><div><strong>{view.label}</strong><small>{view.description}</small></div></button>)}
          </nav>
          <div className="tq-product-stage">
            <header><div><span>Terraqo</span><small>{selected.label}</small></div><label><Search /><span>Buscar personas, proyectos o habilidades</span></label><div className="tq-stage-user"><i>AB</i><span>Antonio Bravo<small>Perfil activo</small></span></div></header>
            <div className="tq-product-stage-body"><aside aria-label="Navegación de muestra"><b>TQ</b>{[Network, UsersRound, BriefcaseBusiness, FileCheck2].map((Icon, index) => <span key={index} className={index === 0 ? "is-active" : ""}><Icon /></span>)}</aside><div className="tq-stage-content" key={active}>{active === "profile" ? <ProfileView /> : active === "workspace" ? <WorkspaceView /> : <NetworkView />}</div></div>
          </div>
          <div className="tq-product-caption"><span>{selected.index} / 03</span><div><h3>{selected.title}</h3><p>{selected.description}</p></div></div>
        </div>
      </div>
    </section>
  );
}

function ProfileView() {
  return <div className="tq-demo-profile"><section className="tq-demo-profile-head"><div className="tq-demo-avatar">AB</div><div><small>Disponible para proyectos</small><h4>Antonio Bravo Cabanillas</h4><p>Topógrafo · Lima, Perú</p></div><span className="tq-demo-action">Perfil público</span></section><div className="tq-demo-metrics"><span><b>6</b> experiencias</span><span><b>8</b> evidencias</span><span><b>4</b> validaciones</span></div><section className="tq-demo-worklog"><div><small>ÚLTIMA BITÁCORA</small><h5>Replanteo de luminarias</h5><p>Trabajo de campo documentado y vinculado a ICC Topografía.</p><span><MapPin /> Lima · <BadgeCheck /> Evidencia validada</span></div><div className="tq-demo-photo"><FolderKanban /></div></section></div>;
}

function WorkspaceView() {
  return <div className="tq-demo-workspace"><div className="tq-demo-title"><div><small>OPERACIÓN ACTIVA</small><h4>Proyecto MIDGO</h4><p>ICC Topografía · 12 responsables</p></div><strong>72%<small>avance general</small></strong></div><div className="tq-demo-progress"><span /></div><div className="tq-demo-columns"><section><small>ACTIVIDAD RECIENTE</small>{["Control de ejes completado", "Informe de campo aprobado", "Nueva evidencia registrada"].map((item, index) => <div key={item}><i className={index < 2 ? "is-done" : ""}>{index < 2 ? <Check /> : null}</i><span><b>{item}</b><small>{index === 0 ? "Hace 18 min" : index === 1 ? "Hoy, 10:42" : "Ayer"}</small></span></div>)}</section><section className="tq-demo-summary"><small>TRAZABILIDAD</small><b>24</b><span>evidencias conectadas</span><p>Autores, fechas y responsables conservan contexto.</p></section></div></div>;
}

function NetworkView() {
  const people = [["YD", "Yamila Denis", "Auxiliar de topografía"], ["AM", "Alex Manya", "Topografía y geodesia"], ["MR", "Miguel Rojas", "Ingeniería civil"]];
  return <div className="tq-demo-network"><div className="tq-demo-network-head"><div><small>RED PROFESIONAL</small><h4>Capacidad disponible para el proyecto</h4></div><span className="tq-demo-action">Selección curada</span></div><div className="tq-demo-people">{people.map(([initials, name, role], index) => <article key={name}><div className="tq-demo-person"><i>{initials}</i><div><h5>{name}</h5><p>{role}</p></div>{index === 0 ? <BadgeCheck /> : null}</div><span>{index === 1 ? "Disponible ahora" : "Disponible para proyectos"}</span><small>Trabajo visible · {index + 2} validaciones</small><span className="tq-demo-action">Perfil disponible</span></article>)}</div><p className="tq-demo-network-note"><ShieldCheck /> Cada profesional decide qué información comparte y con quién conecta.</p></div>;
}
