import { BarChart3, Target, WalletCards } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { createProjectFromSaleAction, updateCommissionStatusAction, updateSellerCommercialAction } from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

const commissionTypes = [
  ["SALE_PERCENTAGE", "Porcentaje sobre venta"],
  ["MARGIN_PERCENTAGE", "Porcentaje sobre margen"],
  ["FIXED_AMOUNT", "Monto fijo"],
  ["CATEGORY_PERCENTAGE", "Diferenciada por categoria"]
] as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSalesPage() {
  const session = await requireAdminPage(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  await requireWorkspaceModule("CRM", terraqoWorkspaceId);
  const role = String(session.user.role);
  const canManageCommercialConditions = ["ADMIN", "SUPER_ADMIN"].includes(role);
  const sellerWhere = canManageCommercialConditions
    ? { department: "SALES" as const, terraqoWorkspaceId }
    : {
        department: "SALES" as const,
        terraqoWorkspaceId,
        OR: [
          { userId: session.user.id },
          ...(session.user.email ? [{ email: session.user.email }] : [])
        ]
      };

  const sellers = await prisma.staffProfile.findMany({
    where: sellerWhere,
      include: {
        assignedLeads: true,
        quotes: true,
        commissions: true
      },
      orderBy: [{ active: "desc" }, { displayName: "asc" }]
    });

  const sellerIds = sellers.map((seller) => seller.id);
  const restrictedSellerIds = sellerIds.length ? sellerIds : ["__no_seller_profile__"];
  const [commissions, sales, wonQuotes] = await Promise.all([
    prisma.commission.findMany({
      where: canManageCommercialConditions ? { quote: { terraqoWorkspaceId } } : { sellerProfileId: { in: restrictedSellerIds }, quote: { terraqoWorkspaceId } },
      include: { sellerProfile: true, quote: true },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.sale.findMany({
      where: canManageCommercialConditions ? { deletedAt: null, terraqoWorkspaceId } : { deletedAt: null, terraqoWorkspaceId, sellerProfileId: { in: restrictedSellerIds } },
      include: {
        company: true,
        contact: true,
        client: true,
        sellerProfile: true,
        quote: true,
        projects: true
      },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.quote.aggregate({
      where: canManageCommercialConditions
        ? { status: "ACCEPTED", deletedAt: null, terraqoWorkspaceId }
        : { status: "ACCEPTED", deletedAt: null, terraqoWorkspaceId, sellerProfileId: { in: restrictedSellerIds } },
      _sum: { total: true }
    })
  ]);

  const pendingCommissionTotal = commissions
    .filter((commission) => commission.status !== "PAID")
    .reduce((sum, commission) => sum + Number(commission.amount), 0);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Workspace comercial</p>
        <h1 className="font-display text-3xl font-bold">Ventas, vendedores y comisiones</h1>
        <p className="mt-2 text-muted-foreground">
          {canManageCommercialConditions
            ? "Controla desempeno comercial, metas, comisiones generadas y pagos pendientes."
            : "Consulta tus ventas asignadas, objetivos y comisiones. Las condiciones comerciales solo las modifica administracion."}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <MetricCard icon={BarChart3} label="Ventas aceptadas" value={`USD ${Number(wonQuotes._sum.total || 0).toLocaleString("en-US")}`} />
        <MetricCard icon={WalletCards} label="Comisiones pendientes" value={`USD ${pendingCommissionTotal.toLocaleString("en-US")}`} />
        <MetricCard icon={Target} label="Vendedores activos" value={String(sellers.filter((seller) => seller.active).length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ventas y ordenes comerciales</CardTitle>
          <CardDescription>Cuando una cotizacion se acepta, se crea una venta trazable y desde aqui puede abrirse el proyecto operativo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Venta</th>
                  <th className="p-3">Cliente / empresa</th>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3">Monto</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Proyecto</th>
                  <th className="p-3">Accion operativa</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const createProject = createProjectFromSaleAction.bind(null, sale.id);
                  const customerName = sale.company?.tradeName || sale.company?.legalName || sale.client?.company || sale.contact?.name || "Cliente por completar";
                  return (
                    <tr key={sale.id} className="border-t align-top">
                      <td className="p-3">
                        <div className="font-semibold">{sale.number}</div>
                        <div className="text-xs text-muted-foreground">{sale.quote?.number || "Sin cotizacion"}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{customerName}</div>
                        <div className="text-xs text-muted-foreground">{sale.contact?.email || sale.client?.email || "-"}</div>
                      </td>
                      <td className="p-3">{sale.sellerProfile?.displayName || "-"}</td>
                      <td className="p-3 font-semibold">{formatCurrency(Number(sale.amount), sale.currency)}</td>
                      <td className="p-3"><StatusBadge status={sale.status} /></td>
                      <td className="p-3">{sale.projects[0]?.title || "Pendiente de apertura"}</td>
                      <td className="p-3">
                        {sale.projects.length ? (
                          <span className="text-xs font-semibold text-muted-foreground">Proyecto creado</span>
                        ) : canManageCommercialConditions ? (
                          <form action={createProject} className="grid gap-2">
                            <Input name="title" placeholder="Nombre del proyecto" defaultValue={`Proyecto ${customerName}`} />
                            <Input name="location" placeholder="Ubicacion" />
                            <Textarea name="summary" placeholder="Alcance operativo inicial" className="min-h-20" />
                            <Button type="submit" size="sm">Crear proyecto</Button>
                          </form>
                        ) : (
                          <span className="text-xs font-semibold text-muted-foreground">Pendiente de apertura por administracion</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!sales.length ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Aun no hay ventas convertidas.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        {sellers.map((seller) => {
          const pendingTotal = seller.commissions.filter((commission) => commission.status !== "PAID").reduce((sum, commission) => sum + Number(commission.amount), 0);
          const closeRate = seller.quotes.length ? Math.round((seller.quotes.filter((quote) => quote.status === "ACCEPTED").length / seller.quotes.length) * 100) : 0;

          return (
            <Card key={seller.id}>
              <CardHeader>
                <CardTitle>{seller.displayName}</CardTitle>
                <CardDescription>{seller.roleTitle} | {seller.territory || "Sin cartera asignada"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-4">
                  <SmallStat label="Leads" value={seller.assignedLeads.length} />
                  <SmallStat label="Cotizaciones" value={seller.quotes.length} />
                  <SmallStat label="Cierre" value={`${closeRate}%`} />
                  <SmallStat label="Pendiente" value={`USD ${pendingTotal.toLocaleString("en-US")}`} />
                </div>
                {canManageCommercialConditions ? (
                  <form action={updateSellerCommercialAction.bind(null, seller.id)} className="grid gap-3 md:grid-cols-2">
                    <select name="commissionType" defaultValue={seller.commissionType} className="h-11 rounded-md border bg-background px-3 text-sm">
                      {commissionTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <Input name="commissionRate" type="number" step="0.01" defaultValue={String(seller.commissionRate)} placeholder="% comision" />
                    <Input name="fixedCommission" type="number" step="0.01" defaultValue={String(seller.fixedCommission)} placeholder="Monto fijo" />
                    <Input name="monthlyGoal" type="number" step="0.01" defaultValue={String(seller.monthlyGoal)} placeholder="Meta mensual" />
                    <Input name="territory" defaultValue={seller.territory || ""} placeholder="Zona / cartera" />
                    <Input name="internalNotes" defaultValue={seller.internalNotes || ""} placeholder="Observaciones internas" />
                    <Button type="submit" className="md:col-span-2">Guardar reglas comerciales</Button>
                  </form>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <ReadOnlyField label="Tipo de comision" value={commissionTypes.find(([value]) => value === seller.commissionType)?.[1] || seller.commissionType} />
                    <ReadOnlyField label="Comision" value={`${Number(seller.commissionRate || 0)}%`} />
                    <ReadOnlyField label="Meta mensual" value={formatCurrency(Number(seller.monthlyGoal || 0))} />
                    <ReadOnlyField label="Cartera" value={seller.territory || "Sin cartera asignada"} />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comisiones</CardTitle>
          <CardDescription>Se generan automaticamente cuando una cotizacion pasa a aceptada.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3">Cotizacion</th>
                  <th className="p-3">Base</th>
                  <th className="p-3">Comision</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Accion</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((commission) => (
                  <tr key={commission.id} className="border-t">
                    <td className="p-3 font-medium">{commission.sellerProfile.displayName}</td>
                    <td className="p-3">{commission.quote?.number || "-"}</td>
                    <td className="p-3">USD {Number(commission.baseAmount).toLocaleString("en-US")}</td>
                    <td className="p-3 font-semibold">USD {Number(commission.amount).toLocaleString("en-US")}</td>
                    <td className="p-3"><StatusBadge status={commission.status} /></td>
                    <td className="p-3">
                      {canManageCommercialConditions ? (
                        <form action={updateCommissionStatusAction.bind(null, commission.id)} className="flex gap-2">
                          <select name="status" defaultValue={commission.status} className="h-9 rounded-md border bg-background px-2 text-xs">
                            {["PENDING", "APPROVED", "PAID", "CANCELLED"].map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                          <Button type="submit" size="sm" variant="outline">Guardar</Button>
                        </form>
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground">Solo administracion</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!commissions.length ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Aun no hay comisiones generadas.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <Icon className="h-5 w-5 text-primary" />
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}
