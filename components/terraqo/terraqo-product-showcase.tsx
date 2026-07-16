import {
  BriefcaseBusiness,
  Check,
  FileCheck2,
  MessageSquare,
  Network,
  ShieldCheck,
  Sparkles,
  UsersRound
} from "lucide-react";

const profileStats = [
  ["18", "proyectos"],
  ["146", "jornadas"],
  ["32", "validaciones"]
];

const projectActivity = [
  ["Informe de avance", "Aprobado"],
  ["Evidencia de campo", "12 archivos"],
  ["Entregable final", "En revision"]
];

export function TerraqoProductShowcase() {
  return (
    <section className="tq-product-showcase" id="producto">
      <div className="tq-public-wrap">
        <p className="tq-section-number">03 / Producto</p>
        <div className="tq-product-heading">
          <h2>Una plataforma.<br />Tres formas de verla trabajar.</h2>
          <p>Vistas de producto construidas sobre el mismo nucleo: identidad, proyectos, evidencia, comunicacion y permisos.</p>
        </div>

        <article className="tq-product-scene tq-product-scene-profile">
          <div className="tq-scene-copy">
            <span>01</span>
            <p className="tq-kicker">Perfil profesional</p>
            <h3>El CV deja de ser una promesa estatica.</h3>
            <p>Cada proyecto, actividad y validacion fortalece una trayectoria privada que el profesional controla.</p>
          </div>
          <div className="tq-capture-frame">
            <CaptureChrome title="Terraqo / Perfil profesional" />
            <div className="tq-capture-body tq-profile-capture">
              <aside className="tq-capture-sidebar">
                <b>TQ</b>
                <i className="is-active" />
                <i /><i /><i /><i />
              </aside>
              <div className="tq-profile-main">
                <header>
                  <div className="tq-profile-avatar">AC</div>
                  <div><small>Perfil verificado</small><h4>Andrea Campos</h4><p>Product Designer · Lima</p></div>
                  <div className="tq-profile-score"><strong>84%</strong><span>perfil completo</span></div>
                </header>
                <div className="tq-profile-statline">
                  {profileStats.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
                </div>
                <div className="tq-profile-worklog">
                  <div><small>Worklog reciente</small><h5>Sistema de reportes puesto en produccion</h5><p>Proceso, archivos y validacion vinculados al proyecto.</p></div>
                  <ShieldCheck aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="tq-product-scene tq-product-scene-workspace">
          <div className="tq-capture-frame">
            <CaptureChrome title="Terraqo / Workspace" />
            <div className="tq-capture-body tq-workspace-capture">
              <div className="tq-workspace-nav">
                <div><b>TQ</b><span>Workspace</span></div>
                <p className="is-active"><BriefcaseBusiness /> Proyectos</p>
                <p><UsersRound /> Equipo</p>
                <p><MessageSquare /> Comunicacion</p>
                <p><FileCheck2 /> Reportes</p>
              </div>
              <div className="tq-workspace-main">
                <header><div><small>Proyecto activo</small><h4>Lanzamiento regional</h4></div><b>72% completado</b></header>
                <div className="tq-project-progress"><span /></div>
                <div className="tq-project-body">
                  <div className="tq-project-timeline">
                    <small>Actividad verificable</small>
                    {projectActivity.map(([title, meta], index) => (
                      <div key={title}><i className={index < 2 ? "is-done" : ""}><Check /></i><p><b>{title}</b><span>{meta}</span></p></div>
                    ))}
                  </div>
                  <div className="tq-project-summary"><Sparkles /><strong>24</strong><span>evidencias conectadas</span><small>Equipo, fechas y responsables conservan contexto.</small></div>
                </div>
              </div>
            </div>
          </div>
          <div className="tq-scene-copy">
            <span>02</span>
            <p className="tq-kicker">Workspace empresarial</p>
            <h3>La operacion completa conserva su contexto.</h3>
            <p>Proyectos, clientes, equipo, documentos y conversaciones viven dentro del workspace de cada organizacion.</p>
          </div>
        </article>

        <article className="tq-product-scene tq-product-scene-network">
          <div className="tq-scene-copy">
            <span>03</span>
            <p className="tq-kicker">Red y oportunidades</p>
            <h3>Las conexiones nacen de capacidad demostrada.</h3>
            <p>Empresas y profesionales descubren oportunidades con contexto, afinidad y evidencia reciente.</p>
          </div>
          <div className="tq-capture-frame tq-capture-dark">
            <CaptureChrome title="Terraqo / Commons" />
            <div className="tq-capture-body tq-network-capture">
              <header><span>Commons</span><b>Trabajo real, conversaciones utiles.</b></header>
              <div className="tq-network-capture-flow">
                <div><BriefcaseBusiness /><small>Empresa</small><strong>Publica una necesidad</strong></div>
                <i />
                <div><Network /><small>Proyecto</small><strong>Ordena el contexto</strong></div>
                <i />
                <div><UsersRound /><small>Talento</small><strong>Demuestra capacidad</strong></div>
              </div>
              <footer><MessageSquare /><span>Conversacion vinculada al proyecto</span><b>12 participantes</b></footer>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function CaptureChrome({ title }: { title: string }) {
  return (
    <div className="tq-capture-chrome">
      <span><i /><i /><i /></span>
      <p>{title}</p>
      <small>terraqo.com</small>
    </div>
  );
}
