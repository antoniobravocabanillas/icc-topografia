import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { terraqoDomains } from "@/lib/terraqo-domains";

export function TerraqoPublicFooter() {
  return (
    <footer className="tq-public-footer">
      <div className="tq-public-wrap">
        <div className="tq-footer-statement">
          <p className="tq-kicker tq-kicker-light">Terraqo</p>
          <h2>El espacio donde el trabajo real encuentra oportunidades reales.</h2>
          <Link href={`${terraqoDomains.portal}/registro`} className="tq-button tq-button-light">Crear una cuenta <ArrowUpRight /></Link>
        </div>
        <div className="tq-footer-bottom">
          <div>
            <Link href="/" className="tq-wordmark tq-wordmark-light">
              <span className="tq-wordmark-mark" aria-hidden="true"><i /><i /><i /></span>
              <span>terraqo</span>
            </Link>
            <p>Software modular, red profesional y evidencia de trabajo en un solo ecosistema.</p>
          </div>
          <div className="tq-footer-links">
            <Link href="/#plataforma">Plataforma</Link>
            <Link href="/#red">Red profesional</Link>
            <Link href={terraqoDomains.portal}>Ingresar</Link>
            <Link href="/privacidad">Privacidad</Link>
            <Link href="/terminos">Terminos</Link>
          </div>
        </div>
        <div className="tq-footer-legal">
          <span>© 2026 Terraqo. Todos los derechos reservados.</span>
          <span>Construido para empresas y profesionales que hacen.</span>
        </div>
      </div>
    </footer>
  );
}
