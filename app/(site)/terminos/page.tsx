import Link from "next/link";
import { LegalLayout } from "@/components/terraqo/legal-layout";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata({
  title: "Términos y condiciones",
  description:
    "Condiciones de contratación de Terraqo, producto de VRILLA S.A.C., RUC 20616279841.",
  path: "/terminos",
});
export default function Page() {
  return (
    <LegalLayout
      title="Términos y condiciones"
      intro="Condiciones aplicables al uso de Terraqo y a las membresías adquiridas a VRILLA S.A.C."
    >
      <h2>1. Proveedor y alcance</h2>
      <p>
        VRILLA S.A.C., RUC 20616279841, con domicilio comercial en Calle Los
        Cipreses, Mz. U, Lote 2, San Miguel, Lima, Perú, opera Terraqo. Puedes
        contactarnos en hola@vrilla.solutions o +51 925 912 607. Estas
        condiciones regulan el software contratado directamente con VRILLA; no
        convierten a VRILLA en empleador, contratista ni garante de las empresas
        o profesionales de la red.
      </p>
      <h2>2. Cuenta y uso responsable</h2>
      <p>
        La cuenta gratuita no requiere tarjeta. Una identidad profesional no
        exige pertenecer a una empresa. Para contratar una membresía debes tener
        capacidad legal o representación suficiente. Protege tus credenciales y
        proporciona información correcta. No está permitido suplantar
        identidades, publicar evidencia falsa, vulnerar permisos ni introducir
        contenido ilícito o malicioso.
      </p>
      <p>
        Conservas los derechos sobre tus contenidos. Autorizas su procesamiento
        únicamente para prestar las funciones elegidas y su publicación según
        los permisos configurados. Antes de compartir documentos debes contar
        con los derechos y autorizaciones necesarios. La validación de un perfil
        o evidencia indica el alcance específico de la revisión, no garantiza
        empleo, solvencia ni resultados futuros.
      </p>
      <h2>3. Plan, precio y contratación</h2>
      <p>
        En Membresías se muestran las capacidades y el precio en soles del plan
        seleccionado. El resumen previo al pago identifica titular, periodicidad
        e importe total, incluidos los impuestos aplicables. No se cobran extras
        por exceder una cuota: la función se limita o se ofrece un cambio de
        plan. Integraciones a medida y prestaciones no incluidas requieren
        acuerdo separado.
      </p>
      <p>
        La contratación se confirma después de tu aceptación expresa y de la
        verificación del pago por la pasarela. Un pago pendiente o un mensaje de
        error no acreditan un cobro aprobado. Consulta Mi membresía antes de
        repetir un intento. El historial permite consultar la operación y no
        sustituye la boleta o factura tributaria correspondiente.
      </p>
      <h2>4. Renovación y cancelación</h2>
      <p>
        La suscripción mensual se cobra por mes; la anual, por el año completo.
        La renovación se autoriza expresamente por el periodo elegido. Puedes
        detenerla desde Mi membresía antes del siguiente cobro; mantienes acceso
        durante el periodo pagado. Si una incidencia impide cancelar desde tu
        cuenta, escríbenos para gestionarla y conservar constancia de la
        solicitud. El cambio de plan se realiza al terminar el periodo vigente;
        no se aplican prorrateos ni cobros simultáneos ocultos.
      </p>
      <p>
        Las asistencias de redacción se reinician por mes calendario UTC; el
        almacenamiento mide capacidad retenida. Al reducir el plan, las cargas
        pueden limitarse sin borrar archivos por ese solo motivo. Las
        condiciones específicas aceptadas en la compra se conservan; no
        alteraremos retroactivamente un periodo pagado.
      </p>
      <h2>5. Seguridad y medios de pago</h2>
      <p>
        El formulario seguro de Culqi procesa los datos de tarjeta. Terraqo no
        almacena el número completo ni el CVV. Una validación de tarjeta puede
        generar una operación de S/3 revertida por el proveedor; no corresponde
        al precio del plan. No envíes tarjetas, claves ni códigos de
        verificación por correo o por el Libro de Reclamaciones.
      </p>
      <p>
        Mientras el checkout indique modo de pruebas, únicamente admite tarjetas
        de prueba; no genera una compra real ni activa beneficios pagados de
        producción. Los planes de prueba pueden finalizar tras tres ciclos. El
        inicio de cobros reales requiere habilitación comercial y tributaria del
        operador.
      </p>
      <h2>6. Prestación, suspensión y responsabilidad</h2>
      <p>
        El servicio digital se habilita al confirmarse el pago. Si no se
        refleja, comunícate con soporte indicando la referencia de la operación.
        Investigaremos la incidencia y aplicaremos la solución correspondiente,
        incluida la devolución cuando proceda. No se promete disponibilidad
        absoluta ni resultados comerciales determinados. Los asistentes de
        redacción requieren revisión humana; no reemplazan asesoramiento
        profesional.
      </p>
      <p>
        Podemos restringir actividad por fraude, riesgo de seguridad o
        incumplimiento, explicando el motivo cuando sea posible sin comprometer
        una investigación o derechos de terceros. La suspensión no elimina
        derechos sobre cobros improcedentes ni reclamaciones. No excluimos
        responsabilidad que la ley no permita excluir.
      </p>
      <h2>7. Atención y controversias</h2>
      <p>
        Consulta la{" "}
        <Link href="/devoluciones">política de cambios y devoluciones</Link> y el{" "}
        <Link href="/libro-de-reclamaciones">Libro de Reclamaciones</Link>. Registrar
        una hoja no impide acudir a Indecopi u otras vías y no constituye
        requisito previo para denunciar. Se aplica la legislación peruana, sin
        restringir competencias ni derechos imperativos del consumidor. Los
        cambios futuros se publicarán con fecha y se informarán cuando afecten
        la contratación.
      </p>
    </LegalLayout>
  );
}
