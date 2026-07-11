import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, BriefcaseBusiness, ShieldCheck } from "lucide-react";
import { ClientRegistrationForm } from "@/components/auth/client-registration-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Registro Portal Terraqo",
  description: "Creacion de cuenta para clientes y profesionales en Portal Terraqo.",
  path: "/registro"
});

export default function ClientRegisterPage() {
  return (
    <section className="relative isolate overflow-hidden bg-[#03111D] text-white">
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(36,200,238,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.11)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="container relative grid min-h-[calc(100vh-4rem)] items-center gap-10 py-16 lg:grid-cols-[1fr_480px]">
        <div className="max-w-3xl">
          <Badge className="bg-white text-[#063D63] hover:bg-white">Portal Terraqo</Badge>
          <h1 className="mt-5 font-display text-4xl font-bold leading-tight md:text-6xl">
            Crea tu acceso como cliente o profesional.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/72">
            Terraqo centraliza solicitudes, proyectos, perfiles, postulaciones y comunicacion operativa. Cada perfil accede solo a la informacion que corresponde a su rol y workspace.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/14 bg-white/[0.055] p-4 backdrop-blur">
              <Building2 className="h-5 w-5 text-[#24C8EE]" />
              <p className="mt-4 font-display text-xl font-bold">Cliente</p>
              <p className="mt-1 text-sm text-white/60">Solicita servicios, revisa cotizaciones y da seguimiento a proyectos activos.</p>
            </div>
            <div className="rounded-lg border border-white/14 bg-white/[0.055] p-4 backdrop-blur">
              <BriefcaseBusiness className="h-5 w-5 text-[#24C8EE]" />
              <p className="mt-4 font-display text-xl font-bold">Profesional</p>
              <p className="mt-1 text-sm text-white/60">Crea tu perfil tecnico, CV vivo privado y base para participar en proyectos.</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/68">
            <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-[#24C8EE]" /> Acceso por perfil</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#24C8EE]" /> Informacion privada</span>
          </div>

          <Button asChild variant="outline" className="mt-8 border-white/30 bg-white/5 text-white hover:bg-white/10">
            <Link href="/cuenta">
              Ya tengo cuenta
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <ClientRegistrationForm />
      </div>
    </section>
  );
}
