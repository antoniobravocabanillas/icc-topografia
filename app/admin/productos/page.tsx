import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { formatCurrency } from "@/lib/utils";

export default async function AdminProductsPage() {
  await requireAdminPage(["EDITOR", "ADMIN"]);
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
  const products = await prisma.product.findMany({
    where: { isActive: true, terraqoWorkspaceId },
    include: { category: true },
    orderBy: { updatedAt: "desc" }
  });

  return (
    <section>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-3xl font-bold">Productos</h1>
          <p className="mt-2 text-muted-foreground">Administra catalogo, precios, stock y productos bajo cotizacion.</p>
        </div>
        <Button asChild><Link href="/admin/productos/nuevo">Nuevo producto</Link></Button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Producto</th>
              <th className="p-3">Marca</th>
              <th className="p-3">Categoria</th>
              <th className="p-3">Precio</th>
              <th className="p-3">Stock</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-t">
                <td className="p-3">
                  <div className="font-medium">{product.name}</div>
                  <div className="text-xs text-muted-foreground">{product.sku}</div>
                </td>
                <td className="p-3">{product.brand}</td>
                <td className="p-3">{product.category.name}</td>
                <td className="p-3">{product.price ? formatCurrency(Number(product.price)) : "Cotizar"}</td>
                <td className="p-3">
                  <Badge variant={product.stock > 0 ? "accent" : "outline"}>{product.stock}</Badge>
                </td>
                <td className="p-3">{product.requiresQuote ? "Cotizacion" : product.badge || "Publicado"}</td>
                <td className="p-3">
                  <Button asChild variant="outline" size="sm"><Link href={`/admin/productos/${product.id}`}>Editar</Link></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
