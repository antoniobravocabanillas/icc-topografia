import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { deleteOrderAction, updateOrderStatusAction } from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { formatCurrency } from "@/lib/utils";

const orderStatuses = ["PENDING", "QUOTED", "PAID", "PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED"] as const;

export default async function AdminOrdersPage() {
  await requireAdminPage(["SALES", "ADMIN"]);
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  await requireWorkspaceModule("TECHNICAL_STORE", terraqoWorkspaceId);
  const orders = await prisma.order.findMany({
    where: { terraqoWorkspaceId },
    include: { items: { include: { product: true } }, address: true },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <section>
      <div>
        <h1 className="font-display text-3xl font-bold">Pedidos</h1>
        <p className="mt-2 text-muted-foreground">Pedidos enviados desde el checkout. Revisa items, cambia estado y elimina pruebas.</p>
      </div>

      <div className="mt-8 space-y-5">
        {orders.map((order) => {
          const updateAction = updateOrderStatusAction.bind(null, order.id);
          const deleteAction = deleteOrderAction.bind(null, order.id);
          return (
            <Card key={order.id}>
              <CardHeader>
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <CardTitle>{order.customerName}</CardTitle>
                    <CardDescription>{order.customerEmail} · {order.customerPhone || "sin telefono"} · {order.createdAt.toLocaleString("es-PE")}</CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{formatCurrency(Number(order.total), order.currency)}</p>
                    <p className="text-sm text-muted-foreground">{order.status}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-muted text-left">
                      <tr>
                        <th className="p-3">Producto</th>
                        <th className="p-3">Cantidad</th>
                        <th className="p-3">Unitario</th>
                        <th className="p-3">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="p-3">
                            <div className="font-medium">{item.product.name}</div>
                            <div className="text-xs text-muted-foreground">{item.product.sku}</div>
                          </td>
                          <td className="p-3">{item.quantity}</td>
                          <td className="p-3">{formatCurrency(Number(item.unitPrice), order.currency)}</td>
                          <td className="p-3">{formatCurrency(Number(item.subtotal), order.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {order.notes ? <p className="rounded-md bg-muted p-3 text-sm leading-6">{order.notes}</p> : null}

                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <form action={updateAction} className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
                    <select name="status" defaultValue={order.status} className="h-11 rounded-md border bg-background px-3 text-sm">
                      {orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                    <input name="notes" defaultValue={order.notes || ""} placeholder="Nota comercial interna" className="h-11 rounded-md border bg-background px-3 text-sm" />
                    <Button type="submit">Actualizar</Button>
                  </form>
                  <form action={deleteAction}>
                    <Button type="submit" variant="destructive">Eliminar</Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!orders.length ? (
          <Card>
            <CardHeader>
              <CardTitle>No hay pedidos todavia</CardTitle>
              <CardDescription>Cuando un cliente registre un pedido desde checkout aparecera aqui.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
