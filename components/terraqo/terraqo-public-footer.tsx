import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { terraqoDomains } from "@/lib/terraqo-domains";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";

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
            <Link href="/" className="inline-flex items-center" aria-label="Terraqo, inicio">
              <TerraqoLogo variant="horizontal" tone="dark" alt="Terraqo" className="tq-footer-logo h-10 w-[155px]" />
            </Link>
            <p>Software modular, red profesional y evidencia de trabajo en un solo ecosistema.</p>
          </div>
          <div className="tq-footer-links">
            <Link href="/plataforma">Plataforma</Link>
            <Link href="/producto">Producto</Link>
            <Link href="/automatizacion">Automatización</Link>
            <Link href="/membresias">Membresías</Link>
            <Link href="/red">Red operativa</Link>
            <a href={terraqoDomains.portal}>Ingresar</a>
            <Link href="/privacidad">Privacidad</Link>
            <Link href="/terminos">Términos</Link>
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
