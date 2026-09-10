import Link from "next/link";
import { LegalLayout } from "@/components/terraqo/legal-layout";
import s from "@/components/terraqo/legal.module.css";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata({
  title: "Centro legal | VRILLA y Terraqo",
  description:
    "Identidad del proveedor, condiciones de suscripción, privacidad, devoluciones y Libro de Reclamaciones de Terraqo.",
  path: "/legal",
});
export default function Page() {
  return (
    <LegalLayout
      title="Reglas claras. Relaciones de confianza."
      intro="Conoce quién presta el servicio, cómo protegemos tu información y cómo ejercer tus derechos."
    >
      <h2>Un producto de VRILLA S.A.C.</h2>
      <p>
        Terraqo es la plataforma de software de VRILLA S.A.C., empresa peruana
        identificada con RUC 20616279841. VRILLA es el proveedor de las
        membresías contratadas directamente en Terraqo. Las empresas que
        participan en la red conservan responsabilidad por sus propios
        servicios, ofertas y contenidos.
      </p>
      <div className={s.cards}>
        {[
          [
            "/terminos",
            "Términos y condiciones",
            "Cuenta, contratación, alcance y renovación.",
          ],
          [
            "/privacidad",
            "Privacidad",
            "Datos personales, finalidades y derechos.",
          ],
          [
            "/devoluciones",
            "Cambios y devoluciones",
            "Cancelación, incidencias y reembolsos.",
          ],
          [
            "/libro-de-reclamaciones",
            "Libro de Reclamaciones",
            "Registra una queja o reclamo sin iniciar sesión.",
          ],
        ].map(([href, title, copy]) => (
          <Link href={href} key={href}>
            <h2>{title}</h2>
            <p>{copy}</p>
            <span>Consultar →</span>
          </Link>
        ))}
      </div>
      <h2>Marco de referencia peruano</h2>
      <p>
        Estas políticas se aplican respetando los derechos imperativos del
        consumidor y la protección de datos. No sustituyen obligaciones legales
        ni excluyen vías de reclamación ante autoridades competentes.
      </p>
      <ul>
        <li>
          <a href="https://www.gob.pe/institucion/indecopi/normas-legales/1244218-29571">
            Ley 29571, Código de Protección y Defensa del Consumidor
          </a>
          , y sus modificaciones, incluidas las Leyes 31435 y 32495.
        </li>
        <li>
          <a href="https://www.gob.pe/institucion/presidencia/normas-legales/541080-011-2011-pcm">
            Reglamento del Libro de Reclamaciones, D.S. 011-2011-PCM
          </a>
          , modificado por D.S. 006-2014-PCM y{" "}
          <a href="https://busquedas.elperuano.pe/dispositivo/NL/2095978-1">
            D.S. 101-2022-PCM
          </a>
          .
        </li>
        <li>
          Ley 29733 y{" "}
          <a href="https://www.gob.pe/institucion/anpd/campa%C3%B1as/128319-nuevo-reglamento-de-proteccion-de-datos-personales">
            su Reglamento, D.S. 016-2024-JUS
          </a>
          .
        </li>
      </ul>
      <p>
        Para consultas contractuales, devoluciones o ejercicio de derechos:{" "}
        <a href="mailto:hola@vrilla.solutions">hola@vrilla.solutions</a>. Para
        quejas y reclamos utiliza también nuestro libro integrado.
      </p>
    </LegalLayout>
  );
}
