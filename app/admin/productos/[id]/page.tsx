import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/products/product-form";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { deleteProductAction, updateProductAction } from "@/lib/server/product-actions";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

type EditProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  await requireAdminPage(["EDITOR", "ADMIN"]);
  const { id } = await params;
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  const [product, categories] = await Promise.all([
    prisma.product.findFirst({ where: { id, terraqoWorkspaceId } }),
    prisma.category.findMany({ where: { terraqoWorkspaceId }, orderBy: { name: "asc" } })
  ]);

  if (!product) notFound();
  const action = updateProductAction.bind(null, product.id);
  const deleteAction = deleteProductAction.bind(null, product.id);

  return (
    <section className="max-w-4xl">
      <h1 className="font-display text-3xl font-bold">Editar producto</h1>
      <p className="mt-2 text-muted-foreground">{product.name}</p>
      <div className="mt-6">
        <ProductForm categories={categories} product={product} action={action} />
      </div>
      <form action={deleteAction} className="mt-6 rounded-lg border border-destructive/30 bg-white p-5">
        <h2 className="font-semibold text-destructive">Eliminar producto</h2>
        <p className="mt-2 text-sm text-muted-foreground">Esta accion elimina el producto del catalogo y de la tienda publica.</p>
        <Button type="submit" variant="destructive" className="mt-4">Eliminar producto</Button>
      </form>
    </section>
  );
}
