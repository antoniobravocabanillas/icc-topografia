import Link from "next/link";
import { legalLinks, legalOperator as op } from "@/lib/terraqo/legal";
import s from "./legal.module.css";
export function LegalLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section className={s.root}>
      <div className={s.wrap}>
        <header className={s.hero}>
          <p className={s.eyebrow}>TERRAQO · CONFIANZA Y TRANSPARENCIA</p>
          <h1>{title}</h1>
          <p>{intro}</p>
          <small>Vigente desde el 9 de septiembre de 2026 · Perú</small>
        </header>
        <nav className={s.nav} aria-label="Información legal">
          {legalLinks.map((l) => (
            <Link key={l.href} href={`https://terraqoglobal.com${l.href}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className={s.content}>{children}</div>
        <div className={s.operator}>
          <strong>Terraqo es un producto de {op.name}</strong>
          <p>
            RUC {op.ruc} · {op.address}
          </p>
          <p>
            <a href={`mailto:${op.email}`}>{op.email}</a> ·{" "}
            <a href={op.phoneHref}>{op.phone}</a>
          </p>
        </div>
      </div>
    </section>
  );
}
