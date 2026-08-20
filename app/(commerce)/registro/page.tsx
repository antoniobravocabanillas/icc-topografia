import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, BriefcaseBusiness, ShieldCheck } from "lucide-react";
import { ClientRegistrationForm } from "@/components/auth/client-registration-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Registro Portal Terraqo",
  description: "Creación de cuenta para clientes y profesionales en Portal Terraqo.",
  path: "/registro"
});

export default function ClientRegisterPage() {
  return (
    <section className="tq-auth-surface relative isolate overflow-hidden bg-[#0e1a26] text-white">
      <div className="container relative grid min-h-[calc(100vh-4rem)] items-center gap-10 py-16 lg:grid-cols-[1fr_480px]">
        <div className="max-w-3xl">
          <Badge className="bg-[#f3f3f3] text-[#0e1a26] hover:bg-[#f3f3f3]">Portal Terraqo</Badge>
          <h1 className="mt-5 font-display text-4xl font-bold leading-tight md:text-6xl">
            Crea tu acceso como cliente o profesional.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/72">
            Terraqo centraliza solicitudes, proyectos, perfiles, postulaciones y comunicación operativa. Cada perfil accede solo a la información que corresponde a su rol y workspace.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/14 bg-white/[0.055] p-4 backdrop-blur">
              <Building2 className="h-5 w-5 text-[#25c0d5]" />
              <p className="mt-4 font-display text-xl font-bold">Cliente</p>
              <p className="mt-1 text-sm text-white/60">Solicita servicios, revisa cotizaciones y da seguimiento a proyectos activos.</p>
            </div>
            <div className="rounded-lg border border-white/14 bg-white/[0.055] p-4 backdrop-blur">
              <BriefcaseBusiness className="h-5 w-5 text-[#25c0d5]" />
              <p className="mt-4 font-display text-xl font-bold">Profesional</p>
              <p className="mt-1 text-sm text-white/60">Crea tu perfil técnico, CV vivo privado y base para participar en proyectos.</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/68">
            <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-[#25c0d5]" /> Acceso por perfil</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#25c0d5]" /> Información privada</span>
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
