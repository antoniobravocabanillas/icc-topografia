import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ title: "Terminos y condiciones", description: "Condiciones de acceso y uso de la plataforma Terraqo.", path: "/terminos" });

export default function TermsPage() {
  return (
    <section className="tq-public-site min-h-[70svh] py-24">
      <div className="tq-public-wrap max-w-4xl">
        <p className="tq-kicker">Uso responsable</p>
        <h1 className="mt-6 text-5xl font-black md:text-7xl">Terminos y condiciones</h1>
        <div className="mt-12 space-y-8 border-t border-black/15 pt-8 text-base leading-8 text-black/65">
          <p>El acceso a Terraqo depende del tipo de cuenta, suscripcion, modulos habilitados y permisos asignados por cada workspace. El usuario es responsable de proteger sus credenciales y mantener actualizada su informacion.</p>
          <p>La evidencia profesional debe corresponder a trabajo real y respetar la confidencialidad de empresas, clientes y proyectos. Las validaciones pueden ser revocadas cuando exista informacion falsa, incompleta o no autorizada.</p>
          <p>Las empresas administran sus propios usuarios y contenidos dentro de su workspace. Terraqo puede limitar cuentas o actividad que infrinjan derechos, generen spam o comprometan la seguridad de la comunidad.</p>
          <section className="space-y-4"><h2 className="text-2xl font-bold text-slate-900">Membresías y pagos · versión 2026-09-v1</h2><p>Crear una cuenta gratuita no requiere tarjeta. Cada compra identifica el plan, propietario, moneda, importe total y periodicidad antes de solicitar autorización. Una cuenta profesional es independiente de las empresas con las que colabora.</p><p>La facturación mensual renueva cada mes; la anual cobra el importe anual completo y renueva cada año. Puedes cancelar futuras renovaciones desde Mi membresía, conservando el periodo efectivamente pagado. Cambiar a otro plan se realiza al finalizar el periodo actual, sin cobros simultáneos ni prorrateos ocultos.</p><p>Los límites de redacción se renuevan por mes calendario UTC, también en contratos anuales. El almacenamiento corresponde a la capacidad retenida, no a una cuota mensual acumulable. Alcanzar un límite no genera cargos adicionales automáticos ni publica tus archivos. Si reduces tu plan, no borramos documentos por esa decisión; las cargas adicionales pueden quedar restringidas hasta disponer de capacidad.</p><p>La pantalla del proveedor procesa la tarjeta. Terraqo recibe identificadores de autorización, no el número completo ni el código de seguridad. Culqi puede realizar una validación de S/3 y devolverla. Un resultado pendiente no equivale a un pago aprobado: la activación depende de confirmación del proveedor.</p><p>En el entorno de pruebas solo se admiten tarjetas de prueba. Los planes sandbox tienen un máximo de tres ciclos y no otorgan permisos pagados de producción. El historial es una constancia de operación y no reemplaza el comprobante tributario.</p><p>Las solicitudes de devolución y controversias se atienden por el canal de contacto de Terraqo, separadamente de la cancelación de renovación. Estas condiciones no limitan los derechos que correspondan al consumidor. Los cobros reales requieren habilitación comercial y tributaria del operador.</p></section>
        </div>
      </div>
    </section>
  );
}
