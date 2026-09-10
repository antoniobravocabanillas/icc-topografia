import Link from "next/link";
import { LegalLayout } from "@/components/terraqo/legal-layout";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata({
  title: "Cambios, cancelaciones y devoluciones",
  description:
    "Cómo cancelar una membresía de Terraqo o solicitar revisión de un cobro a VRILLA S.A.C.",
  path: "/devoluciones",
});
export default function Page() {
  return (
    <LegalLayout
      title="Cambios y devoluciones"
      intro="Cancelar una renovación y solicitar una devolución son procesos distintos. Te explicamos ambos."
    >
      <h2>Servicio digital, sin envío físico</h2>
      <p>
        Las membresías de Terraqo habilitan funciones digitales. No requieren
        despacho ni entrega física. La activación depende del pago confirmado y
        puede consultarse en Mi membresía. Si el cargo está aprobado y el
        servicio no se habilita, contacta a hola@vrilla.solutions con la
        referencia de la operación.
      </p>
      <h2>Cancelar o cambiar un plan</h2>
      <p>
        Puedes cancelar futuras renovaciones desde{" "}
        <a href="https://portal.terraqoglobal.com/membresia">Mi membresía</a>{" "}
        sin penalidad de cancelación. Conservas el periodo pagado. La
        cancelación no produce por sí sola un reembolso de un periodo prestado.
        Para cambiar de plan, espera al término del periodo vigente y selecciona
        el nuevo alcance. Si el sistema impide gestionar la solicitud, utiliza
        nuestro correo de atención para que quede registrada.
      </p>
      <h2>Cuándo solicitar una devolución</h2>
      <p>
        Revisamos, entre otros supuestos, cargos duplicados, importes diferentes
        a lo autorizado, cobros posteriores a una cancelación o falta de
        prestación del servicio contratado. La solución se determina según los
        hechos, el servicio efectivamente prestado y los derechos aplicables. No
        usamos cláusulas de “sin devoluciones” para excluir obligaciones legales
        ni imponemos un plazo comercial que extinga esos derechos.
      </p>
      <h2>Cómo solicitarla</h2>
      <p>
        Escribe a{" "}
        <a href="mailto:hola@vrilla.solutions">hola@vrilla.solutions</a> con tu
        nombre, cuenta, fecha, importe y referencia del pago, motivo y solución
        solicitada. No envíes número completo de tarjeta, CVV o claves. También
        puedes registrar un <Link href="/libro-de-reclamaciones">reclamo formal</Link>
        , sin iniciar sesión y sin renunciar a otras vías.
      </p>
      <p>
        Si corresponde un reembolso, comunicaremos el importe y la gestión
        realizada. Se tramita por el medio de pago original cuando técnicamente
        sea posible. Si se necesita una alternativa, se verificará al titular y
        se acordará de forma segura. El tiempo de reflejo bancario depende del
        emisor; informaremos la referencia disponible y no prometeremos una
        acreditación instantánea.
      </p>
      <h2>Respuesta y constancia</h2>
      <p>
        Los reclamos y quejas del libro reciben respuesta dentro de quince días
        hábiles, sin prórroga. Conserva tu constancia y código. Una devolución y
        la respuesta al reclamo se registran como actuaciones distintas: cerrar
        una atención no sustituye ejecutar el reembolso acordado. La versión de
        prueba de Culqi no mueve dinero real.
      </p>
    </LegalLayout>
  );
}
