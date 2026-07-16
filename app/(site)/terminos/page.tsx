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
        </div>
      </div>
    </section>
  );
}
