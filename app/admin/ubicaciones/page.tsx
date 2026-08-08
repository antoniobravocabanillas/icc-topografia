import { LocationSelect } from "@/components/location/location-select";

export default function AdminLocationsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Plataforma global</p>
      <h1 className="mt-3 font-display text-4xl font-bold text-foreground">Ubicaciones</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Catálogo maestro para formularios de Terraqo y tiendas conectadas. El flujo usa país, departamento/estado/provincia
        y ciudad mediante listas desplegables, evitando categorías manuales duplicadas por workspace.
      </p>

      <section className="mt-8 rounded-xl border bg-card p-6 shadow-technical">
        <h2 className="text-xl font-bold">Selector global</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Este selector es el componente base que debe reutilizarse en registros, checkout, perfiles, direcciones de entrega y
          formularios comerciales donde se solicite ubicación.
        </p>
        <div className="mt-6">
          <LocationSelect required />
        </div>
      </section>
    </main>
  );
}
