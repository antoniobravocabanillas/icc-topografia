import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  CircleDot,
  MessagesSquare,
  Network,
  Play,
  ShieldCheck,
  Sparkles,
  UsersRound
} from "lucide-react";
import { TerraqoMemberships } from "@/components/terraqo/terraqo-memberships";
import { TerraqoProductShowcase } from "@/components/terraqo/terraqo-product-showcase";

const layers = [
  { skill: "Estrategia de marca", source: "Worklog", tone: "rust" },
  { skill: "Sistema de diseño", source: "Proyecto", tone: "slate" },
  { skill: "Automatizacion", source: "Validado", tone: "ochre" },
  { skill: "Liderazgo tecnico", source: "Equipo", tone: "moss" },
  { skill: "Producto digital", source: "Evidencia", tone: "rust" }
];

const modules = [
  ["01", "Workspace operativo", "Clientes, proyectos, documentos, permisos y actividad bajo una misma organizacion."],
  ["02", "CRM y relacion comercial", "Leads, oportunidades, cotizaciones y seguimiento sin perder el contexto del trabajo."],
  ["03", "Proyectos y evidencia", "Tareas, avances, entregables y trazabilidad que tambien pueden alimentar experiencia validada."],
  ["04", "Comunicacion conectada", "Chat, equipos, foros y Terraqo Meet integrados a personas, empresas y proyectos."],
  ["05", "Red y marketplace", "Perfiles, oportunidades, postulaciones, retos y alianzas entre profesionales y empresas."],
  ["06", "API y productos activables", "Cada capacidad se habilita por plan, rol y workspace para convertirse en software vendible."]
];

const evidence = [
  { time: "08:42", label: "Proceso documentado", title: "Nueva iteracion del sistema de reportes", skill: "#ProductDesign" },
  { time: "11:10", label: "Hito validado", title: "Flujo de aprobacion puesto en produccion", skill: "#Automation" },
  { time: "16:25", label: "Equipo conectado", title: "Entrega aprobada por la empresa contratante", skill: "#ProjectOps" }
];

export const dynamic = "force-static";

export default function TerraqoHomePage() {
  return (
    <main className="tq-public-site">
      <section className="tq-hero">
        <div className="tq-public-wrap tq-hero-layout">
          <div className="tq-hero-copy">
            <p className="tq-kicker">La infraestructura del trabajo real</p>
            <h1>Tu empresa opera.<br />Tu trabajo <em>deja evidencia.</em></h1>
            <p className="tq-hero-lede">
              Terraqo conecta software modular, proyectos, empresas y profesionales. La operacion diaria se convierte en trazabilidad para el negocio y en experiencia verificable para las personas.
            </p>
            <div className="tq-hero-actions">
              <Link href="/registro" className="tq-button tq-button-dark">Empezar en Terraqo <ArrowUpRight /></Link>
              <Link href="#plataforma" className="tq-text-link">Conocer la plataforma <ArrowDown /></Link>
            </div>
            <div className="tq-hero-proof" aria-label="Principios Terraqo">
              <span><Check /> Modulos activables</span>
              <span><Check /> Privacidad por workspace</span>
              <span><Check /> Evidencia verificable</span>
            </div>
          </div>

          <div className="tq-core-visual" aria-label="Representacion de un perfil Terraqo alimentado por trabajo real">
            <div className="tq-core-meta">
              <span>Muestra de perfil</span>
              <b>Actualizado hoy</b>
            </div>
            <div className="tq-core-body">
              <div className="tq-core-tube">
                <span className="tq-core-cap" />
                <div className="tq-core-layers">
                  {layers.map((layer) => <span key={layer.skill} className={`tq-core-layer tq-core-${layer.tone}`} />)}
                </div>
              </div>
              <div className="tq-core-labels">
                {layers.map((layer, index) => (
                  <div key={layer.skill} style={{ animationDelay: `${index * 110 + 180}ms` }}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p><b>{layer.skill}</b><small>{layer.source}</small></p>
                  </div>
                ))}
              </div>
            </div>
            <p className="tq-core-caption">El perfil no se declara. Se construye con trabajo, contexto y validaciones.</p>
          </div>
        </div>
        <div className="tq-hero-ribbon">
          <div className="tq-public-wrap">
            <span>Workspace</span><i />
            <span>CRM</span><i />
            <span>Proyectos</span><i />
            <span>Red profesional</span><i />
            <span>Worklog</span><i />
            <span>Marketplace</span>
          </div>
        </div>
      </section>

      <section className="tq-manifesto" id="plataforma">
        <div className="tq-public-wrap">
          <p className="tq-section-number">01 / Plataforma</p>
          <div className="tq-manifesto-line">
            <h2>Un sistema para operar.<br />Una red para crecer.</h2>
            <p>Terraqo no obliga a todas las organizaciones a trabajar igual. Cada empresa activa las capacidades que necesita y conserva sus datos, usuarios y procesos dentro de su propio workspace.</p>
          </div>
          <div className="tq-two-paths">
            <article id="empresas">
              <BriefcaseBusiness aria-hidden="true" />
              <p className="tq-kicker">Para empresas</p>
              <h3>Software que se adapta al negocio, no al reves.</h3>
              <p>Desde CRM y proyectos hasta portales, contenidos, comercio, talento y comunicacion. Terraqo funciona como una base operativa modular, activable por suscripcion.</p>
              <Link href="#demo">Diseñar mi workspace <ArrowRight /></Link>
            </article>
            <article>
              <UsersRound aria-hidden="true" />
              <p className="tq-kicker">Para profesionales</p>
              <h3>Una trayectoria que se actualiza mientras trabajas.</h3>
              <p>Experiencias, evidencias, validaciones y colaboraciones alimentan un CV vivo privado. El profesional decide su disponibilidad y quien puede acceder a su perfil completo.</p>
              <Link href="/registro">Crear perfil profesional <ArrowRight /></Link>
            </article>
          </div>
        </div>
      </section>

      <section className="tq-module-story">
        <div className="tq-public-wrap tq-module-layout">
          <div className="tq-module-intro">
            <p className="tq-section-number">02 / Sistema modular</p>
            <h2>Activa solo lo que mueve tu operacion.</h2>
            <p>El mismo nucleo puede servir a una constructora, un estudio creativo, una firma legal o una empresa tecnologica. Los modulos cambian; la trazabilidad permanece.</p>
            <span className="tq-plan-signal"><CircleDot /> Escala por plan, permisos y uso</span>
          </div>
          <div className="tq-module-rail">
            {modules.map(([number, title, description]) => (
              <article key={number}>
                <span>{number}</span>
                <div><h3>{title}</h3><p>{description}</p></div>
                <ArrowUpRight aria-hidden="true" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <TerraqoProductShowcase />

      <section className="tq-network" id="red">
        <div className="tq-public-wrap">
          <p className="tq-section-number tq-section-number-light">04 / Red Terraqo</p>
          <div className="tq-network-heading">
            <h2>El mercado laboral deja de ser una lista de vacantes.</h2>
            <p>Empresas, proyectos y profesionales conviven en el mismo contexto. Se encuentran por necesidades reales, evidencia reciente y capacidad de colaborar.</p>
          </div>
          <div className="tq-network-flow" aria-label="Flujo de relaciones en Terraqo">
            <div><BriefcaseBusiness /><b>Empresa</b><span>publica un reto</span></div>
            <i><ArrowRight /></i>
            <div><Sparkles /><b>Proyecto</b><span>define el contexto</span></div>
            <i><ArrowRight /></i>
            <div><UsersRound /><b>Talento</b><span>demuestra capacidad</span></div>
            <i><ArrowRight /></i>
            <div><Network /><b>Equipo</b><span>entrega y valida</span></div>
          </div>
          <div className="tq-network-note">
            <MessagesSquare />
            <p><b>La conversacion nace del trabajo.</b> Chat, foros, equipos y videollamadas se conectan a proyectos y oportunidades, reduciendo mensajes frios y ruido comercial.</p>
          </div>
          <div className="mt-8 flex justify-end">
            <Link href="/red" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/25 bg-white px-6 text-sm font-black text-[#083b38] transition hover:-translate-y-0.5 hover:bg-[#dff7f1]">
              Explorar la red operativa <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="tq-worklog" id="worklog">
        <div className="tq-public-wrap tq-worklog-layout">
          <div className="tq-worklog-copy">
            <p className="tq-section-number">05 / CV vivo</p>
            <h2>El trabajo habla por ti.</h2>
            <p>El Worklog convierte procesos, entregas y aprendizajes en una bitacora profesional. Cada entrada conserva contexto, habilidades y nivel de verificacion.</p>
            <ul>
              <li><ShieldCheck /> La identidad y la experiencia se validan por etapas.</li>
              <li><Play /> La evidencia puede incluir documentos, imagenes o avances.</li>
              <li><Network /> El profesional controla la visibilidad de su CV vivo.</li>
            </ul>
          </div>
          <div className="tq-evidence-stream">
            <header><span>Worklog / esta semana</span><b>3 evidencias</b></header>
            {evidence.map((item, index) => (
              <article key={item.time}>
                <time>{item.time}</time>
                <span className={index === 1 ? "is-active" : ""} />
                <div><small>{item.label}</small><h3>{item.title}</h3><p>{item.skill}</p></div>
              </article>
            ))}
            <footer><ShieldCheck /> 2 evidencias validadas por una organizacion</footer>
          </div>
        </div>
      </section>

      <section className="tq-principle">
        <div className="tq-public-wrap">
          <p className="tq-section-number">06 / La diferencia</p>
          <blockquote>“En Terraqo, decir que sabes abre una conversacion. Mostrar lo que hiciste abre una oportunidad.”</blockquote>
          <div className="tq-principle-detail">
            <p>No buscamos otro feed de autopromocion. La relevancia nace de evidencia, proyectos, validaciones y afinidad profesional.</p>
            <p>La informacion privada no se vuelve publica por defecto. Empresas y profesionales controlan permisos, visibilidad y relaciones.</p>
          </div>
        </div>
      </section>

      <TerraqoMemberships />

      <section className="tq-final-cta" id="demo">
        <div className="tq-public-wrap">
          <p className="tq-kicker tq-kicker-light">Para quienes construyen</p>
          <h2>Convierte tu operacion en un sistema que tambien crea oportunidades.</h2>
          <div>
            <Link href="/registro" className="tq-button tq-button-light">Crear una cuenta <ArrowUpRight /></Link>
            <a href="mailto:hola@terraqo.com?subject=Quiero%20conocer%20Terraqo" className="tq-text-link tq-text-link-light">Solicitar una demo <ArrowRight /></a>
          </div>
        </div>
      </section>
    </main>
  );
}
