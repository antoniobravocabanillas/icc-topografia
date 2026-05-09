import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";

export function ConversionBand() {
  return (
    <section className="icc-depth-bg icc-volume-gradient py-14 text-primary-foreground">
      <div className="container flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-white/70">{brand.name}</p>
          <h2 className="mt-2 max-w-3xl font-display text-3xl font-bold md:text-4xl">Conversemos sobre el alcance tecnico, plazos y equipamiento de tu proyecto.</h2>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" variant="secondary">
            <Link href="/cotizacion">Solicitar cotizacion <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
            <a href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "51999999999"}`}>
              <MessageCircle className="h-4 w-4" />
              Hablar con asesor
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
