"use client";
import Link from "next/link";
import { useState } from "react";
import { BILLING_PLANS, money, planAmount, supportsBillingCycle, type BillingAudience, type BillingCycle } from "@/lib/terraqo/billing/catalog";
import { getDefaultModulesForTier, terraqoModules } from "@/lib/workspace";
import { ExperienceShell } from "./public-experience";
import s from "./public-experience.module.css";

export function MembershipExplorer() {
  const [audience, setAudience] = useState<BillingAudience>("PERSONAL");
  const [cycle, setCycle] = useState<BillingCycle>("MONTHLY");
  const plans = BILLING_PLANS.filter(plan => plan.audience === audience);
  return <ExperienceShell eyebrow="Membresías" title="Empieza libre. Crece con capacidad." intro="Una identidad propia para cada profesional. Un espacio independiente para cada empresa. Elige el alcance que necesitas y gestiona tu suscripción dentro de Terraqo.">
    <div className={s.segmented} aria-label="Tipo de membresía">
      <button type="button" aria-pressed={audience === "PERSONAL"} onClick={() => setAudience("PERSONAL")}>Profesionales</button>
      <button type="button" aria-pressed={audience === "WORKSPACE"} onClick={() => setAudience("WORKSPACE")}>Empresas</button>
    </div>
    <div className={s.segmented} aria-label="Periodo de facturación">
      <button type="button" aria-pressed={cycle === "MONTHLY"} onClick={() => setCycle("MONTHLY")}>Mensual</button>
      <button type="button" aria-pressed={cycle === "ANNUAL"} onClick={() => setCycle("ANNUAL")}>Anual · ahorra 2 meses</button>
    </div>
    <div className={s.plans}>{plans.map(plan => <article className={s.plan} key={plan.code}>
      <h2>{plan.name}</h2><p>{plan.description}</p>
      <div className={s.price}>{plan.monthlyMinor ? money(planAmount(plan, cycle)) : "Sin costo"}<small>{plan.monthlyMinor ? cycle === "ANNUAL" ? " / año" : " / mes" : " · sin tarjeta"}</small></div>
      {cycle === "ANNUAL" && plan.monthlyMinor > 0 && <p>Un pago anual. Ahorras {money(plan.monthlyMinor * 12 - plan.annualMinor)} frente al pago mensual.</p>}
      <ul>
        <li>{audience === "PERSONAL" ? "Perfil y trayectoria independientes" : `${plan.seats} ${plan.seats === 1 ? "integrante incluido" : "integrantes incluidos"}`}</li>
        <li>{plan.storageMb < 1000 ? `${plan.storageMb} MB` : `${plan.storageMb / 1000} GB`} de almacenamiento</li>
        <li>{plan.aiActions.toLocaleString("es-PE")} asistencias de redacción / mes</li>
        {plan.automationRuns > 0 && <li>{plan.automationRuns.toLocaleString("es-PE")} ejecuciones de automatización / mes</li>}
        {audience === "WORKSPACE" && <li>{plan.tier === "FREE" ? "Identidad empresarial y comunidad" : "Módulos detallados en la comparación"}</li>}
      </ul>
      {!supportsBillingCycle(plan,cycle) && <p>El pago anual excede el límite de la pasarela para esta cuenta. Puedes contratar este plan mensualmente; no dividimos el cobro anual en operaciones adicionales.</p>}
      <Link className={s.primary} href={plan.monthlyMinor ? `https://portal.terraqoglobal.com/membresia?plan=${plan.code}&cycle=${supportsBillingCycle(plan,cycle)?cycle:"MONTHLY"}` : `/registro?tipo=${audience === "PERSONAL" ? "professional" : "client"}`}>{plan.monthlyMinor ? supportsBillingCycle(plan,cycle)?`Comprar ${plan.name}`:"Contratar mensual" : "Crear cuenta gratis"}<span aria-hidden>↗</span></Link>
    </article>)}</div>
    <p className={s.disclaimer}>Precios en soles; incluyen IGV cuando corresponde. Renovación por el periodo elegido, con cancelación desde tu cuenta. Los límites de uso se renuevan cada mes también en el plan anual. No hay cargos automáticos por excedentes. Integraciones a medida, revisión humana y servicios de terceros no están incluidos.</p>
    {audience === "WORKSPACE" && <details className={s.comparison}><summary>Comparar los módulos de cada plan</summary><div className={s.tableScroll} tabIndex={0} role="region" aria-label="Comparación de planes empresariales"><table><caption>Capacidades estándar. Cada empresa conserva sus propios datos y permisos. El simulador de automatización es una demostración; no se incluye ejecución de flujos productivos.</caption><thead><tr><th scope="col">Módulo</th>{plans.map(plan => <th scope="col" key={plan.code}>{plan.name}</th>)}</tr></thead><tbody>{terraqoModules.filter(module=>module.code!=="AUTOMATIONS").map(module => <tr key={module.code}><th scope="row">{module.label}</th>{plans.map(plan => <td key={plan.code}>{getDefaultModulesForTier(plan.tier).includes(module.code) ? "Incluido" : "—"}</td>)}</tr>)}</tbody></table></div></details>}
    <div className={s.notes}><section><h2>Tu cuenta, tu decisión.</h2><p>El plan gratuito no caduca y no necesita tarjeta. Los documentos privados nunca pasan a ser públicos por contratar una membresía.</p></section><section><h2>Sin salir de Terraqo.</h2><p>Revisa el total, autoriza el pago seguro y consulta la activación y tus comprobantes de operación en un solo lugar.</p><Link href="https://portal.terraqoglobal.com/membresia">Gestionar mi membresía →</Link></section></div>
  </ExperienceShell>;
}
