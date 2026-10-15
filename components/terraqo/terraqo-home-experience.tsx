"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, BellRing, BriefcaseBusiness, CalendarDays, Check, FileCheck2, MapPin, Network, ShieldCheck, UserRoundCheck, Workflow } from "lucide-react";
import { terraqoDomains } from "@/lib/terraqo-domains";
import styles from "./terraqo-home-experience.module.css";

const views = [
  { id:"identity", label:"Identidad", icon:UserRoundCheck, title:"Una trayectoria que se actualiza con trabajo real.", copy:"Experiencias, bitácoras, documentos y validaciones bajo control del profesional.", stats:["12 registros","5 experiencias","4 validaciones"] },
  { id:"workspace", label:"Workspace", icon:BriefcaseBusiness, title:"La operación mantiene contexto y responsables.", copy:"Proyectos, equipos, archivos y conversaciones aislados dentro de cada empresa.", stats:["17 proyectos","22 profesionales","148 evidencias"] },
  { id:"automation", label:"Automatización", icon:Workflow, title:"Los procesos avanzan sin seguimiento manual.", copy:"Eventos y acciones conectan CRM, proyectos, talento y comunicación según el plan.", stats:["5 flujos","1.000 ejecuciones","Auditoría activa"] },
] as const;
const signals = [["AB","Antonio Bravo","Replanteo de luminarias"],["YD","Yamila Denis","Levantamiento validado"],["IC","ICC Topografía","Oportunidad publicada"]];

export type HomeWorklog = {
  id: string;
  title: string;
  summary: string;
  occurredAt: string;
  updatedAt: string;
  location: string | null;
  authorName: string;
  authorImage: string | null;
  headline: string | null;
  username: string | null;
  profilePublished: boolean;
  context: string | null;
  imageUrls: string[];
};

const WORKLOGS_PER_PAGE = 2;

function EvidenceImage({ src, alt, sizes, priority = false, compact = false }: { src: string; alt: string; sizes: string; priority?: boolean; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={`${styles.mediaFallback}${compact ? ` ${styles.mediaFallbackCompact}` : ""}`} aria-label={`${alt} no disponible`}><FileCheck2 aria-hidden="true" /></span>;
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized onError={()=>setFailed(true)} />;
}

function WorklogAvatar({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed
    ? <Image src={src} alt="" width={36} height={36} unoptimized onError={()=>setFailed(true)} />
    : <i aria-hidden="true">{name.slice(0,1)}</i>;
}

function WorklogFeatureCard({ worklog, priority = false }: { worklog: HomeWorklog; priority?: boolean }) {
  const primaryImage = worklog.imageUrls[0];
  const secondaryImages = worklog.imageUrls.slice(1, 4);
  const content = <>
    <span className={styles.worklogVisual}>
      {primaryImage ? (
        <span className={styles.worklogMainImage}>
          <EvidenceImage src={primaryImage} alt={`Evidencia de ${worklog.title}`} sizes="(max-width: 700px) 88vw, (max-width: 1100px) 42vw, 280px" priority={priority} />
        </span>
      ) : (
        <span className={styles.worklogFallback}><FileCheck2 aria-hidden="true" /><small>Evidencia pública</small></span>
      )}
      {secondaryImages.length ? <span className={styles.worklogThumbs}>{secondaryImages.map((imageUrl, index) => <span key={imageUrl}><EvidenceImage src={imageUrl} alt={`Vista ${index + 2} de ${worklog.title}`} sizes="76px" compact /></span>)}</span> : null}
    </span>
    <span className={styles.worklogBody}>
      <span className={styles.worklogUpdate}>Actualizado {new Intl.DateTimeFormat("es-PE", { day:"2-digit", month:"short" }).format(new Date(worklog.updatedAt))}</span>
      <strong>{worklog.title}</strong>
      <span className={styles.worklogAuthor}>
        <WorklogAvatar src={worklog.authorImage} name={worklog.authorName} />
        <span><b>{worklog.authorName}</b><small>{worklog.headline || worklog.context || "Profesional Terraqo"}</small></span>
      </span>
      <span className={styles.worklogMeta}>{worklog.location || worklog.context ? <span><MapPin aria-hidden="true" />{worklog.location || worklog.context}</span> : null}<span><CalendarDays aria-hidden="true" />{new Intl.DateTimeFormat("es-PE", { day:"2-digit", month:"short", year:"numeric" }).format(new Date(worklog.occurredAt))}</span></span>
      <small className={styles.worklogSummary}>{worklog.summary}</small>
    </span>
    {worklog.profilePublished ? <span className={styles.worklogAction} aria-hidden="true"><ArrowRight /></span> : null}
  </>;
  return worklog.profilePublished && worklog.username
    ? <Link className={styles.worklogCard} href={`/cv/${encodeURIComponent(worklog.username)}/evidencias#${worklog.id}`} aria-label={`Ver evidencia: ${worklog.title}`}>{content}</Link>
    : <article className={`${styles.worklogCard} ${styles.worklogCardStatic}`}>{content}</article>;
}

export function TerraqoHomeExperience({ latestWorklogs }: { latestWorklogs: HomeWorklog[] }) {
  const [active,setActive] = useState<(typeof views)[number]["id"]>("identity");
  const [worklogPage, setWorklogPage] = useState(0);
  const current = views.find((item)=>item.id===active) ?? views[0];
  const ActiveIcon=current.icon;
  const worklogPageCount = Math.max(1, Math.ceil(latestWorklogs.length / WORKLOGS_PER_PAGE));
  const visibleWorklogs = latestWorklogs.slice(worklogPage * WORKLOGS_PER_PAGE, (worklogPage + 1) * WORKLOGS_PER_PAGE);
  return <div className={styles.site}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>La red del trabajo real</span>
        <h1>Tu trabajo merece <em>ser reconocido.</em></h1>
        <p>Convierte cada proyecto en parte de tu trayectoria. Personas, empresas y evidencia conectadas con contexto verificable.</p>
        <div className={styles.actions}><Link href={`${terraqoDomains.portal}/registro`} prefetch={false}>Crear mi identidad <ArrowRight aria-hidden="true" /></Link><Link href="/producto">Conoce Terraqo <ArrowRight aria-hidden="true" /></Link></div>
        <div className={styles.facts}><span><Check aria-hidden="true" /> Perfil independiente</span><span><Check aria-hidden="true" /> Evidencia verificable</span><span><Check aria-hidden="true" /> Propiedad de tus datos</span></div>
      </div>
      <div className={styles.signalBoard}>
        <header>
          <div><span>Movimientos públicos de la red</span><h2>El trabajo real, visible.</h2></div>
          <Link href="/red">Ver todas <ArrowRight aria-hidden="true" /></Link>
        </header>
        <div className={styles.worklogStack}>{visibleWorklogs.length ? visibleWorklogs.map((worklog,index)=><WorklogFeatureCard worklog={worklog} priority={worklogPage === 0 && index === 0} key={worklog.id} />) : <div className={styles.emptyWorklogs}><FileCheck2 aria-hidden="true" /><b>La red está lista para recibir su primera evidencia pública.</b><span>Las publicaciones autorizadas aparecerán aquí automáticamente.</span></div>}</div>
        <footer>
          <span><ShieldCheck aria-hidden="true" /> Actividad pública de toda la red, ordenada por su última actualización.</span>
          {latestWorklogs.length > WORKLOGS_PER_PAGE ? <span className={styles.worklogPager}><small>{String(worklogPage * WORKLOGS_PER_PAGE + 1).padStart(2,"0")}–{String(Math.min((worklogPage + 1) * WORKLOGS_PER_PAGE, latestWorklogs.length)).padStart(2,"0")} / {String(latestWorklogs.length).padStart(2,"0")}</small><button type="button" aria-label="Movimientos anteriores" disabled={worklogPage === 0} onClick={()=>setWorklogPage((page)=>Math.max(0,page-1))}><ArrowLeft /></button><button type="button" aria-label="Siguientes movimientos" disabled={worklogPage >= worklogPageCount - 1} onClick={()=>setWorklogPage((page)=>Math.min(worklogPageCount-1,page+1))}><ArrowRight /></button></span> : null}
        </footer>
      </div>
      <div className={styles.heroFootline}><span>Personas, proyectos y evidencias conectados.</span><span>Una infraestructura profesional que da valor a tu trabajo.</span></div>
    </section>
    <section className={styles.statement}><span>No es otro directorio</span><h2>Un CV dice lo que hiciste.<em>Terraqo puede demostrarlo.</em></h2><p>El trabajo deja de quedar aislado en documentos y conversaciones. Cada resultado puede conservar proyecto, autor, fecha, evidencia y validación.</p></section>
    <section className={styles.product}><div className={styles.sectionIntro}><span>Producto conectado</span><h2>Tres espacios. Una sola fuente de contexto.</h2><p>Selecciona una vista para entender cómo se relacionan sin mezclar propiedad ni permisos.</p></div><div className={styles.productShell}><nav>{views.map(({id,label,icon:Icon})=><button key={id} type="button" aria-pressed={active===id} onClick={()=>setActive(id)}><Icon />{label}</button>)}</nav><div className={styles.productView} key={active}><div className={styles.productIcon}><ActiveIcon /></div><div><small>{current.label}</small><h3>{current.title}</h3><p>{current.copy}</p><div className={styles.stats}>{current.stats.map((stat)=><span key={stat}>{stat}</span>)}</div><Link href={active==="automation"?"/automatizacion":active==="workspace"?"/plataforma":"/producto"}>Ver capacidad completa <ArrowRight /></Link></div></div></div></section>
    <section className={styles.networkSection}><div className={styles.sectionIntro}><span>Red profesional</span><h2>Conecta con capacidad demostrada, no con ruido.</h2><p>Descubre profesionales y empresas por experiencia visible, especialidad, disponibilidad y trabajo documentado.</p></div><div className={styles.people}>{signals.map(([initials,name,event],index)=><article key={name}><header><i>{initials}</i><div><h3>{name}</h3><p>{index===2?"Empresa verificada":"Profesional disponible"}</p></div>{index<2&&<BadgeCheck />}</header><span>{event}</span><footer><Link href="/red">Explorar en la red</Link><ArrowRight /></footer></article>)}</div></section>
    <section className={styles.trust}><div><span>Confianza por capas</span><h2>No toda información tiene el mismo peso.</h2><p>Terraqo diferencia lo declarado de aquello revisado, respaldado o confirmado.</p><Link href="/plataforma">Conocer la arquitectura <ArrowRight /></Link></div><ol>{[["01","Declarado"],["02","Revisado por Terraqo"],["03","Respaldado por supervisor"],["04","Confirmado por empresa"]].map(([n,label])=><li key={n}><b>{n}</b><span>{label}</span><FileCheck2 /></li>)}</ol></section>
    <section className={styles.automation}><BellRing /><div><span>Automatización por suscripción</span><h2>El seguimiento ocurre mientras el equipo trabaja.</h2><p>Professional activa alertas y asignaciones; Premium suma condiciones; Enterprise incorpora integraciones y gobierno avanzado.</p></div><Link href="/automatizacion">Comparar capacidades <ArrowRight /></Link></section>
    <section className={styles.closing}><Network /><h2>Construye una identidad profesional que crece mientras trabajas.</h2><p>Trabajo real. Contexto compartido. Confianza verificable.</p><div className={styles.actions}><Link href={`${terraqoDomains.portal}/registro`} prefetch={false}>Crear cuenta <ArrowRight /></Link><Link href="/membresias">Ver membresías</Link></div></section>
  </div>;
}
