"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { ProductCard, type ProductCardProduct } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type StoreCategory = {
  id: string;
  name: string;
  slug: string;
  count: number;
};

type StoreCatalogProps = {
  categories: StoreCategory[];
  products: ProductCardProduct[];
};

type SortOption = "featured" | "price-asc" | "price-desc" | "name";

const PAGE_SIZE = 6;

export function StoreCatalog({ categories, products }: StoreCatalogProps) {
  const [query, setQuery] = useState("");
  const [categorySlug, setCategorySlug] = useState("all");
  const [sort, setSort] = useState<SortOption>("featured");
  const [page, setPage] = useState(1);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = products.filter((product) => {
      const searchable = [product.name, product.brand, product.model, product.summary, product.category?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesQuery = normalizedQuery ? searchable.includes(normalizedQuery) : true;
      const matchesCategory = categorySlug === "all" || product.category?.slug === categorySlug;
      return matchesQuery && matchesCategory;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "price-asc") return (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER);
      if (sort === "price-desc") return (b.price ?? 0) - (a.price ?? 0);
      if (sort === "name") return a.name.localeCompare(b.name);
      return 0;
    });
  }, [categorySlug, products, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const visibleProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [categorySlug, query, sort]);

  function clearFilters() {
    setQuery("");
    setCategorySlug("all");
    setSort("featured");
  }

  return (
    <section className="container py-18">
      <div className="grid gap-8 lg:grid-cols-[300px_1fr] lg:items-end">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.32em] text-primary">Catalogo tecnico</p>
          <h2 className="mt-4 max-w-xl font-display text-4xl font-black leading-[0.98] text-foreground md:text-5xl">
            Encuentra el equipo segun tu obra, terreno o entregable.
          </h2>
        </div>
        <div className="grid gap-4 lg:justify-items-end">
          <label className="w-full max-w-md">
            <span className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-primary">Buscar producto</span>
            <span className="relative mt-2 block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ej. estacion total, GNSS, LiDAR"
                className="h-14 rounded-lg border-primary/20 bg-white pl-11"
              />
            </span>
          </label>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOption)}
            className="h-12 w-full max-w-xs rounded-lg border border-primary/20 bg-white px-4 text-sm font-semibold"
          >
            <option value="featured">Destacados primero</option>
            <option value="price-asc">Precio menor a mayor</option>
            <option value="price-desc">Precio mayor a menor</option>
            <option value="name">Nombre A-Z</option>
          </select>
        </div>
      </div>

      <div className="mt-10 rounded-xl border border-primary/15 bg-white/82 p-4 shadow-[0_22px_80px_rgba(0,80,80,0.08)]">
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-foreground">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          Filtros
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <button type="button" onClick={() => setCategorySlug("all")} className={filterClass(categorySlug === "all")}>
            Todos
          </button>
          {categories.map((category) => (
            <button key={category.id} type="button" onClick={() => setCategorySlug(category.slug)} className={filterClass(categorySlug === category.slug)}>
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">
          {filteredProducts.length} productos disponibles
        </p>
        <div className="flex items-center gap-2">
          <p className="mr-2 font-mono text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Pagina {page} de {totalPages}
          </p>
          <Button type="button" variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {visibleProducts.length ? (
        <div className="mt-7 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visibleProducts.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      ) : (
        <Card className="mt-7 rounded-xl border-primary/15">
          <CardContent className="p-8">
            <p className="font-display text-2xl font-black">No encontramos equipos con esos filtros.</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Prueba otra categoria o solicita una recomendacion tecnica para tu alcance de obra.
            </p>
            <Button type="button" className="mt-5" onClick={clearFilters}>
              Ver catalogo completo
            </Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function filterClass(active: boolean) {
  return cn(
    "min-h-12 rounded-lg border px-4 py-3 text-left text-sm font-black transition",
    active
      ? "border-primary bg-primary text-primary-foreground shadow-[0_14px_32px_rgba(0,150,136,0.20)]"
      : "border-primary/18 bg-white text-foreground hover:border-primary hover:bg-primary/5"
  );
}
