import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
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
  { skill: "Automatización", source: "Validado", tone: "ochre" },
  { skill: "Liderazgo técnico", source: "Equipo", tone: "moss" },
  { skill: "Producto digital", source: "Evidencia", tone: "rust" }
];

const modules = [
  ["Operar", "Workspace, CRM y proyectos", "La empresa organiza clientes, responsables, documentos y decisiones con permisos propios."],
  ["Documentar", "Worklog y evidencia", "Cada avance conserva autor, fecha, contexto, archivos y relación con el trabajo que lo originó."],
  ["Validar", "Confianza verificable", "Empresas y responsables autorizados revisan resultados sin apropiarse del perfil profesional."],
  ["Conectar", "Red y oportunidades", "La capacidad demostrada se convierte en descubrimiento, conversación y nuevas relaciones de trabajo."]
];

const evidence = [
  { time: "08:42", label: "Proceso documentado", title: "Nueva iteración del sistema de reportes", skill: "#ProductDesign" },
  { time: "11:10", label: "Hito validado", title: "Flujo de aprobación puesto en producción", skill: "#Automation" },
  { time: "16:25", label: "Equipo conectado", title: "Entrega aprobada por la empresa contratante", skill: "#ProjectOps" }
];

export const dynamic = "force-static";

export default function TerraqoHomePage() {
  return (
    <div className="tq-public-site">
      <section className="tq-hero">
        <div className="tq-public-wrap tq-hero-layout">
          <div className="tq-hero-copy">
            <p className="tq-kicker">La infraestructura del trabajo real</p>
            <h1>Tu empresa opera.<br />Tu trabajo <em>deja evidencia.</em></h1>
            <p className="tq-hero-lede">
              Terraqo conecta software modular, proyectos, empresas y profesionales. La operación diaria se convierte en trazabilidad para el negocio y en experiencia verificable para las personas.
            </p>
            <div className="tq-hero-actions">
              <Link href="/registro" className="tq-button tq-button-dark">Empezar en Terraqo <ArrowUpRight /></Link>
              <Link href="#plataforma" className="tq-text-link">Conocer la plataforma <ArrowDown /></Link>
            </div>
            <div className="tq-hero-proof" aria-label="Principios Terraqo">
              <span><Check /> Módulos activables</span>
              <span><Check /> Privacidad por workspace</span>
              <span><Check /> Evidencia verificable</span>
            </div>
          </div>

          <div className="tq-core-visual" aria-label="Representación de un perfil Terraqo alimentado por trabajo real">
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
          <div className="tq-platform-heading">
            <h2>La operación y la trayectoria profesional comparten contexto, <em>no propiedad.</em></h2>
            <p>Terraqo conecta dos espacios independientes. La empresa conserva su operación privada; cada persona conserva su identidad, su experiencia y las evidencias que tiene permiso para publicar.</p>
          </div>
          <div className="tq-platform-system">
            <article className="tq-platform-side" id="empresas">
              <span className="tq-platform-label">Workspace empresarial</span>
              <BriefcaseBusiness aria-hidden="true" />
              <h3>La empresa opera.</h3>
              <p>Clientes, proyectos, permisos, archivos y conversaciones permanecen dentro de su organización.</p>
              <Link href="#demo">Configurar un workspace <ArrowRight /></Link>
            </article>
            <div className="tq-platform-core" aria-label="Flujo verificable de Terraqo">
              <span className="tq-platform-label">Núcleo Terraqo</span>
              <ol>
                {modules.map(([step, title, description], index) => (
                  <li key={step}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><small>{step}</small><h3>{title}</h3><p>{description}</p></div>
                  </li>
                ))}
              </ol>
            </div>
            <article className="tq-platform-side tq-platform-side-professional">
              <span className="tq-platform-label">Workspace personal</span>
              <UsersRound aria-hidden="true" />
              <h3>La persona progresa.</h3>
              <p>Su CV vivo reúne experiencia, validaciones y evidencia pública bajo su propio control.</p>
              <Link href="/registro">Crear un perfil profesional <ArrowRight /></Link>
            </article>
          </div>
          <div className="tq-platform-footnote">
            <span><ShieldCheck /> Privacidad por diseño</span>
            <p>Compartir una evidencia no abre el workspace. Validar una experiencia no transfiere la identidad profesional.</p>
          </div>
        </div>
      </section>

      <TerraqoProductShowcase />

      <section className="tq-network" id="red">
        <div className="tq-public-wrap">
          <p className="tq-section-number tq-section-number-light">03 / Red Terraqo</p>
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
            <p><b>La conversación nace del trabajo.</b> Chat, foros, equipos y videollamadas se conectan a proyectos y oportunidades, reduciendo mensajes fríos y ruido comercial.</p>
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
            <p className="tq-section-number">04 / CV vivo</p>
            <h2>El trabajo habla por ti.</h2>
            <p>El Worklog convierte procesos, entregas y aprendizajes en una bitácora profesional. Cada entrada conserva contexto, habilidades y nivel de verificación.</p>
            <ul>
              <li><ShieldCheck /> La identidad y la experiencia se validan por etapas.</li>
              <li><Play /> La evidencia puede incluir documentos, imágenes o avances.</li>
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
            <footer><ShieldCheck /> 2 evidencias validadas por una organización</footer>
          </div>
        </div>
      </section>

      <section className="tq-principle">
        <div className="tq-public-wrap">
          <p className="tq-section-number">05 / La diferencia</p>
          <blockquote>“En Terraqo, decir que sabes abre una conversación. Mostrar lo que hiciste abre una oportunidad.”</blockquote>
          <div className="tq-principle-detail">
            <p>No buscamos otro feed de autopromoción. La relevancia nace de evidencia, proyectos, validaciones y afinidad profesional.</p>
            <p>La información privada no se vuelve pública por defecto. Empresas y profesionales controlan permisos, visibilidad y relaciones.</p>
          </div>
        </div>
      </section>

      <TerraqoMemberships />

      <section className="tq-final-cta" id="demo">
        <div className="tq-public-wrap">
          <p className="tq-kicker tq-kicker-light">Para quienes construyen</p>
          <h2>Convierte tu operación en un sistema que también crea oportunidades.</h2>
          <div>
            <Link href="/registro" className="tq-button tq-button-light">Crear una cuenta <ArrowUpRight /></Link>
            <a href="mailto:hola@terraqo.com?subject=Quiero%20conocer%20Terraqo" className="tq-text-link tq-text-link-light">Solicitar una demo <ArrowRight /></a>
          </div>
        </div>
      </section>
    </div>
  );
}
