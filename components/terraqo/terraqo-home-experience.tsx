"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BadgeCheck, BellRing, BriefcaseBusiness, CalendarDays, Check, FileCheck2, MapPin, Network, ShieldCheck, UserRoundCheck, Workflow } from "lucide-react";
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
  location: string | null;
  authorName: string;
  authorImage: string | null;
  headline: string | null;
  username: string;
  context: string | null;
  imageUrl: string | null;
};

export function TerraqoHomeExperience({ latestWorklogs }: { latestWorklogs: HomeWorklog[] }) {
  const [active,setActive] = useState<(typeof views)[number]["id"]>("identity");
  const current = views.find((item)=>item.id===active) ?? views[0];
  const ActiveIcon=current.icon;
  return <div className={styles.site}>
    <section className={styles.hero}><div className={styles.heroCopy}><span className={styles.eyebrow}>La red del trabajo real</span><h1>Tu trabajo deja huella.<em>Terraqo la convierte en confianza.</em></h1><p>Personas, empresas, proyectos y evidencia conectados en una infraestructura profesional que respeta la propiedad de cada dato.</p><div className={styles.actions}><Link href="/registro">Crear mi identidad <ArrowRight /></Link><Link href="/producto">Explorar el producto</Link></div><div className={styles.facts}><span><Check /> Perfil independiente</span><span><Check /> Evidencia verificable</span><span><Check /> Workspace privado</span></div></div><div className={styles.signalBoard}><header><span>Últimas bitácoras públicas</span><Link href="/red">Ver todas <ArrowRight /></Link></header><div className={styles.worklogStack}>{latestWorklogs.length ? latestWorklogs.map((worklog)=><Link className={styles.worklogCard} href={`/cv/${encodeURIComponent(worklog.username)}/evidencias#${worklog.id}`} key={worklog.id}>{worklog.imageUrl ? <span className={styles.worklogImage}><Image src={worklog.imageUrl} alt="" fill sizes="(max-width: 900px) 96px, 126px" unoptimized /></span> : <span className={styles.worklogFallback}><FileCheck2 /></span>}<span className={styles.worklogBody}><span className={styles.worklogAuthor}>{worklog.authorImage ? <Image src={worklog.authorImage} alt="" width={26} height={26} unoptimized /> : <i>{worklog.authorName.slice(0,1)}</i>}<b>{worklog.authorName}</b></span><strong>{worklog.title}</strong><small>{worklog.summary}</small><span className={styles.worklogMeta}><span><CalendarDays />{new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"short"}).format(new Date(worklog.occurredAt))}</span>{worklog.location || worklog.context ? <span><MapPin />{worklog.location || worklog.context}</span> : null}</span></span><span className={styles.worklogAction}><ArrowRight /></span></Link>) : <div className={styles.emptyWorklogs}><FileCheck2 /><b>La red está lista para recibir su primera evidencia pública.</b><span>Las publicaciones autorizadas aparecerán aquí automáticamente.</span></div>}</div><footer><ShieldCheck /> Sólo se muestra actividad pública autorizada.</footer></div></section>
    <section className={styles.statement}><span>No es otro directorio</span><h2>Un CV dice lo que hiciste.<em>Terraqo puede demostrarlo.</em></h2><p>El trabajo deja de quedar aislado en documentos y conversaciones. Cada resultado puede conservar proyecto, autor, fecha, evidencia y validación.</p></section>
    <section className={styles.product}><div className={styles.sectionIntro}><span>Producto conectado</span><h2>Tres espacios. Una sola fuente de contexto.</h2><p>Selecciona una vista para entender cómo se relacionan sin mezclar propiedad ni permisos.</p></div><div className={styles.productShell}><nav>{views.map(({id,label,icon:Icon})=><button key={id} type="button" aria-pressed={active===id} onClick={()=>setActive(id)}><Icon />{label}</button>)}</nav><div className={styles.productView} key={active}><div className={styles.productIcon}><ActiveIcon /></div><div><small>{current.label}</small><h3>{current.title}</h3><p>{current.copy}</p><div className={styles.stats}>{current.stats.map((stat)=><span key={stat}>{stat}</span>)}</div><Link href={active==="automation"?"/automatizacion":active==="workspace"?"/plataforma":"/producto"}>Ver capacidad completa <ArrowRight /></Link></div></div></div></section>
    <section className={styles.networkSection}><div className={styles.sectionIntro}><span>Red profesional</span><h2>Conecta con capacidad demostrada, no con ruido.</h2><p>Descubre profesionales y empresas por experiencia visible, especialidad, disponibilidad y trabajo documentado.</p></div><div className={styles.people}>{signals.map(([initials,name,event],index)=><article key={name}><header><i>{initials}</i><div><h3>{name}</h3><p>{index===2?"Empresa verificada":"Profesional disponible"}</p></div>{index<2&&<BadgeCheck />}</header><span>{event}</span><footer><Link href="/red">Explorar en la red</Link><ArrowRight /></footer></article>)}</div></section>
    <section className={styles.trust}><div><span>Confianza por capas</span><h2>No toda información tiene el mismo peso.</h2><p>Terraqo diferencia lo declarado de aquello revisado, respaldado o confirmado.</p><Link href="/plataforma">Conocer la arquitectura <ArrowRight /></Link></div><ol>{[["01","Declarado"],["02","Revisado por Terraqo"],["03","Respaldado por supervisor"],["04","Confirmado por empresa"]].map(([n,label])=><li key={n}><b>{n}</b><span>{label}</span><FileCheck2 /></li>)}</ol></section>
    <section className={styles.automation}><BellRing /><div><span>Automatización por suscripción</span><h2>El seguimiento ocurre mientras el equipo trabaja.</h2><p>Professional activa alertas y asignaciones; Premium suma condiciones; Enterprise incorpora integraciones y gobierno avanzado.</p></div><Link href="/automatizacion">Comparar capacidades <ArrowRight /></Link></section>
    <section className={styles.closing}><Network /><h2>Construye una identidad profesional que crece mientras trabajas.</h2><p>Trabajo real. Contexto compartido. Confianza verificable.</p><div className={styles.actions}><Link href="/registro">Crear cuenta <ArrowRight /></Link><Link href="/membresias">Ver membresías</Link></div></section>
  </div>;
}
