import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ title: "Politica de privacidad", description: "Politica de privacidad y tratamiento de datos personales.", path: "/privacidad" });

export default function PrivacyPage() {
  return (
    <section className="tq-public-site min-h-[70svh] py-24">
      <div className="tq-public-wrap max-w-4xl">
        <p className="tq-kicker">Confianza y control</p>
        <h1 className="mt-6 text-5xl font-black md:text-7xl">Politica de privacidad</h1>
        <div className="mt-12 space-y-8 border-t border-black/15 pt-8 text-base leading-8 text-black/65">
          <p>Terraqo utiliza la informacion registrada para habilitar cuentas, workspaces, postulaciones, proyectos, comunicaciones y capacidades contratadas dentro de la plataforma.</p>
          <p>La visibilidad de perfiles, experiencias, documentos y actividad se controla mediante permisos, relacion con el workspace y configuracion de cada usuario. La informacion privada no se publica automaticamente.</p>
          <p>Los documentos de identidad y validacion se procesan exclusivamente para verificar perfiles y prevenir suplantaciones. Cada usuario puede solicitar la revision o eliminacion de sus datos conforme a la normativa aplicable.</p>
        </div>
      </div>
    </section>
  );
}
