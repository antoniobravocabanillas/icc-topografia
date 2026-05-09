import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/scroll-reveal";

type HeroMetric = {
  value: string;
  label: string;
};

type TechnicalPageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  metrics?: HeroMetric[];
  primaryCta?: {
    label: string;
    href: string;
  };
  secondaryCta?: {
    label: string;
    href: string;
  };
};

export function TechnicalPageHero({
  eyebrow,
  title,
  description,
  metrics = [],
  primaryCta,
  secondaryCta
}: TechnicalPageHeroProps) {
  return (
    <section className="icc-depth-bg relative isolate overflow-hidden border-b bg-[#03111D] text-white">
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(36,200,238,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.11)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#24C8EE]/70 to-transparent" />
      <div className="container relative grid min-h-[460px] items-center gap-10 py-16 lg:grid-cols-[1fr_420px]">
        <ScrollReveal>
          <div className="max-w-3xl">
            <Badge className="bg-white text-[#063D63] hover:bg-white">{eyebrow}</Badge>
            <h1 className="icc-ambient-glow mt-5 font-display text-4xl font-bold leading-tight text-white md:text-6xl">{title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/72">{description}</p>
            {(primaryCta || secondaryCta) ? (
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {primaryCta ? (
                  <Button asChild size="lg">
                    <Link href={primaryCta.href}>{primaryCta.label} <ArrowRight className="h-4 w-4" /></Link>
                  </Button>
                ) : null}
                {secondaryCta ? (
                  <Button asChild size="lg" variant="outline" className="border-white/35 bg-white/10 text-white hover:bg-white/18">
                    <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={120} className="hidden lg:block">
          <div className="icc-glass relative overflow-hidden rounded-lg border p-6">
            <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(36,200,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(36,200,238,0.12)_1px,transparent_1px)] [background-size:24px_24px]" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase text-[#7DE4FF]">Sistema operativo ICC</p>
              <div className="mt-6 space-y-5">
                {(metrics.length ? metrics : [
                  { value: "QA/QC", label: "control de entregables" },
                  { value: "B2B", label: "flujo comercial tecnico" },
                  { value: "360", label: "servicio, equipo y soporte" }
                ]).map((metric) => (
                  <div key={metric.label} className="grid grid-cols-[90px_1fr] items-center gap-4 border-b border-white/14 pb-4 last:border-b-0 last:pb-0">
                    <span className="font-display text-3xl font-bold text-[#24C8EE]">{metric.value}</span>
                    <span className="text-sm leading-5 text-white/72">{metric.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
