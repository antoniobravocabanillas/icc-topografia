import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";

type Section = { eyebrow: string; title: string; description: string; icon: LucideIcon };

export function TerraqoSectionPage({
  eyebrow,
  title,
  intro,
  sections,
  closing,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Section[];
  closing: string;
}) {
  return (
    <div className="tq-detail-page">
      <section className="tq-detail-hero">
        <div className="tq-public-wrap">
          <p className="tq-kicker">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{intro}</p>
          <div className="tq-detail-actions">
            <Link href="/registro" className="tq-button tq-button-dark">Empezar en Terraqo <ArrowRight /></Link>
            <Link href="/contacto?asunto=demo-terraqo" className="tq-text-link">Hablar con Terraqo <ArrowRight /></Link>
          </div>
        </div>
      </section>
      <section className="tq-detail-grid">
        <div className="tq-public-wrap">
          {sections.map(({ eyebrow: itemEyebrow, title: itemTitle, description, icon: Icon }, index) => (
            <article key={itemTitle}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <Icon aria-hidden="true" />
              <small>{itemEyebrow}</small>
              <h2>{itemTitle}</h2>
              <p>{description}</p>
              <div><Check /> Incluido en el mismo ecosistema</div>
            </article>
          ))}
        </div>
      </section>
      <section className="tq-detail-closing">
        <div className="tq-public-wrap"><ShieldCheck /><h2>{closing}</h2><Link href="/membresias">Comparar membresías <ArrowRight /></Link></div>
      </section>
    </div>
  );
}
