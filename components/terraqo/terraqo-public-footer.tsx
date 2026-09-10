import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { terraqoDomains } from "@/lib/terraqo-domains";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";
import {legalOperator as op} from "@/lib/terraqo/legal";

export function TerraqoPublicFooter() {
  return (
    <footer className="tq-public-footer">
      <div className="tq-public-wrap">
        <div className="tq-footer-statement">
          <p className="tq-kicker tq-kicker-light">Terraqo</p>
          <h2>El espacio donde el trabajo real encuentra oportunidades reales.</h2>
          <a href={`${terraqoDomains.portal}/registro`} className="tq-button tq-button-light">Crear una cuenta <ArrowUpRight /></a>
        </div>
        <div className="tq-footer-bottom">
          <div>
            <Link href={terraqoDomains.public} className="inline-flex items-center" aria-label="Terraqo, inicio">
              <TerraqoLogo variant="horizontal" tone="dark" alt="Terraqo" className="tq-footer-logo h-10 w-[155px]" />
            </Link>
            <p>Software modular, red profesional y evidencia de trabajo en un solo ecosistema.</p>
          </div>
          <div className="tq-footer-links">
            <Link href={`${terraqoDomains.public}/plataforma`}>Plataforma</Link>
            <Link href={`${terraqoDomains.public}/producto`}>Producto</Link>
            <Link href={`${terraqoDomains.public}/automatizacion`}>Automatización</Link>
            <Link href={`${terraqoDomains.public}/membresias`}>Membresías</Link>
            <Link href={`${terraqoDomains.public}/red`}>Red operativa</Link>
            <a href={terraqoDomains.portal}>Ingresar</a>
            <Link href={`${terraqoDomains.public}/privacidad`}>Privacidad</Link>
            <Link href={`${terraqoDomains.public}/terminos`}>Términos</Link>
            <Link href={`${terraqoDomains.public}/legal`}>Centro legal</Link>
            <Link href={`${terraqoDomains.public}/devoluciones`}>Cambios y devoluciones</Link>
            <Link href={`${terraqoDomains.public}/libro-de-reclamaciones`}>Libro de Reclamaciones</Link>
          </div>
        </div>
        <div className="tq-footer-legal">
          <span>© 2026 Terraqo, producto de {op.name} · RUC {op.ruc}<br/>{op.address}</span>
          <span><a href={`mailto:${op.email}`}>{op.email}</a><br/><a href={op.phoneHref}>{op.phone}</a></span>
        </div>
      </div>
    </footer>
  );
}
