import { LegalLayout } from "@/components/terraqo/legal-layout";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata({
  title: "Política de privacidad",
  description:
    "Tratamiento de datos personales en Terraqo por VRILLA S.A.C. y ejercicio de derechos.",
  path: "/privacidad",
});
export default function Page() {
  return (
    <LegalLayout
      title="Política de privacidad"
      intro="Tu información tiene un propósito y permisos definidos. Aquí explicamos su tratamiento."
    >
      <h2>Responsable</h2>
      <p>
        VRILLA S.A.C., RUC 20616279841, es responsable del tratamiento de los
        datos de cuentas, contratación y atención de Terraqo. Domicilio: Calle
        Los Cipreses, Mz. U, Lote 2, San Miguel, Lima, Perú. Contacto:
        hola@vrilla.solutions. Cuando una empresa administra información propia
        dentro de su workspace, determina sus fines y permisos; VRILLA presta el
        soporte técnico correspondiente sin apropiarse de esa información.
      </p>
      <h2>Datos y finalidades</h2>
      <p>
        Procesamos datos de identidad y contacto, información profesional que
        aportes, contenidos y evidencias, datos de uso necesarios para
        seguridad, preferencias y referencias de pago. Los documentos de
        identidad se tratan para verificaciones solicitadas, prevención de
        suplantación y atención de obligaciones. No solicites ni publiques
        información ajena sin autorización.
      </p>
      <p>
        Utilizamos la información necesaria para ejecutar el servicio, gestionar
        cuentas y cuotas, comunicaciones transaccionales, incidencias y
        obligaciones legales. El Libro de Reclamaciones recoge datos del
        consumidor y representante cuando corresponda, detalle y pedido, para
        tramitar y acreditar su atención. No se exige consentimiento comercial
        para reclamar. Si se propone un tratamiento opcional basado en
        consentimiento, su autorización debe ser específica y revocable.
      </p>
      <h2>Destinatarios y procesamiento internacional</h2>
      <p>
        La operación utiliza proveedores tecnológicos de alojamiento, base de
        datos, correo y pagos, entre ellos Netlify, Prisma, Resend y Culqi. Las
        funciones de redacción pueden transmitir el texto necesario al proveedor
        configurado, como Groq u OpenAI. No incluyas secretos ni documentos
        sensibles en solicitudes de redacción. Estos servicios pueden procesar
        información fuera de Perú. Las transferencias deben sujetarse a las
        garantías y obligaciones aplicables, limitando datos y acceso al
        propósito del servicio.
      </p>
      <p>
        No vendemos datos personales. Podemos atender requerimientos válidos de
        autoridades y comunicar información necesaria para la defensa de
        derechos. Un perfil público o evidencia autorizada puede ser accesible e
        indexada por buscadores; la contratación de un plan no vuelve públicos
        documentos privados.
      </p>
      <h2>Conservación y seguridad</h2>
      <p>
        Mantenemos la información necesaria durante la relación y los plazos
        legales de conservación o defensa. Las hojas de reclamación se conservan
        al menos dos años desde su registro y durante procedimientos pendientes
        que requieran preservarlas. La cancelación de una cuenta no elimina
        automáticamente registros que deban conservarse por ley. Los accesos
        administrativos se restringen; las respuestas del libro quedan
        registradas y no son visibles a empresas ajenas.
      </p>
      <h2>Cookies y almacenamiento local</h2>
      <p>
        Se emplean mecanismos necesarios de sesión, seguridad y continuidad del
        plan seleccionado. Bloquearlos puede impedir iniciar sesión o completar
        la compra. Los proveedores de pago incorporan sus mecanismos de
        seguridad al abrir el checkout. Cualquier incorporación de seguimiento
        publicitario opcional deberá contar con información y consentimiento
        previo cuando resulte exigible; no se presume autorizado por navegar.
      </p>
      <h2>Ejercicio de derechos</h2>
      <p>
        Puedes solicitar información, acceso, rectificación, cancelación u
        oposición y los demás derechos aplicables ante hola@vrilla.solutions,
        indicando tu petición y un medio de respuesta. Verificaremos identidad o
        representación de forma proporcional; no envíes contraseñas. Atenderemos
        en los plazos legales según el derecho ejercido y explicaremos cualquier
        conservación obligatoria. Retirar consentimiento no afecta el
        tratamiento previo lícito ni las obligaciones legales. Puedes acudir a
        la Autoridad Nacional de Protección de Datos Personales si consideras
        vulnerados tus derechos.
      </p>
      <p>
        Marco aplicable: Ley 29733 y Reglamento aprobado por D.S. 016-2024-JUS,
        vigente desde el 31 de marzo de 2025. Esta publicación no constituye una
        certificación ni una declaración de inscripción de bancos de datos.
      </p>
    </LegalLayout>
  );
}
