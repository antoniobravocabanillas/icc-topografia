import {StaffPolicyForm} from "@/components/admin/staff-policy-form";
import {Prisma} from "@prisma/client";
import {commercialMoney, commercialMoneyTotals} from "@/lib/server/commercial-money";
import {staffFixedCommissionCurrency} from "@/lib/server/staff-financial-policy";
import {FormSubmitButton} from "@/components/admin/form-submit-button";
import {StaffPolicyFeedback} from "@/components/admin/staff-policy-feedback";
import { BarChart3, Target, WalletCards } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
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

export default async function AdminSalesPage({searchParams}: {searchParams: Promise<{policy?: string}>}) {
  const {policy} = await searchParams;
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
        commissions: {include: {quote: {select: {currency: true}}}}
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
    prisma.quote.groupBy({
      by: ["currency"],
      where: canManageCommercialConditions
        ? { status: "ACCEPTED", deletedAt: null, terraqoWorkspaceId }
        : { status: "ACCEPTED", deletedAt: null, terraqoWorkspaceId, sellerProfileId: { in: restrictedSellerIds } },
      _sum: { total: true }
    })
  ]);

  const pendingCommissionTotal = commissions
    .filter((commission) => ["PENDING", "APPROVED"].includes(commission.status))
    .map(commission => ({amount: commission.amount, currency: commission.quote?.currency}));

  return (
    <section className="space-y-8">
      <StaffPolicyFeedback status={policy} />
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
        <MetricCard icon={BarChart3} label="Ventas aceptadas" value={commercialMoneyTotals(wonQuotes.map(group => ({amount: group._sum.total || new Prisma.Decimal(0), currency: group.currency})))} />
        <MetricCard icon={WalletCards} label="Pendientes en esta lista" value={commercialMoneyTotals(pendingCommissionTotal)} />
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
                      <td className="p-3 font-semibold">{commercialMoney(sale.amount, sale.currency)}</td>
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
          const pendingTotal = seller.commissions.filter((commission) => ["PENDING", "APPROVED"].includes(commission.status)).map(commission => ({amount: commission.amount, currency: commission.quote?.currency}));
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
                  <SmallStat label="Pendiente" value={commercialMoneyTotals(pendingTotal)} />
                </div>
                {canManageCommercialConditions ? (
                  <StaffPolicyForm key={seller.updatedAt.toISOString()} action={updateSellerCommercialAction.bind(null, seller.id)} profileId={seller.id}>
                    <input type="hidden" name="version" value={seller.updatedAt.toISOString()} />
                    <select aria-label="Tipo de comisión" name="commissionType" defaultValue={seller.commissionType} className="h-11 rounded-md border bg-background px-3 text-sm">
                      {commissionTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <label className="grid gap-1 text-sm font-medium">Porcentaje de comisión<Input name="commissionRate" type="number" step="0.01" defaultValue={String(seller.commissionRate)} placeholder="% comision" /></label>
                    <label className="grid gap-1 text-sm font-medium">Comisión fija<Input name="fixedCommission" type="number" step="0.01" defaultValue={String(seller.fixedCommission)} placeholder="Monto fijo" /></label>
      <label className="grid gap-1 text-sm font-medium">Moneda de comisión fija
        <select name="commissionCurrency" defaultValue={staffFixedCommissionCurrency(seller.tools) || ""} className="h-11 rounded-md border bg-background px-3 text-sm">
          <option value="">Seleccionar moneda</option><option value="PEN">PEN · Soles</option><option value="USD">USD · Dólares</option>
        </select>
        <span className="text-xs font-normal text-muted-foreground">Debe coincidir con la cotización. No se convierte automáticamente.</span>
      </label>
                    <label className="grid gap-1 text-sm font-medium">Meta mensual declarada<Input name="monthlyGoal" type="number" step="0.01" defaultValue={String(seller.monthlyGoal)} placeholder="Meta mensual" /></label>
                    <Input name="territory" defaultValue={seller.territory || ""} placeholder="Zona / cartera" />
                    <Input name="internalNotes" defaultValue={seller.internalNotes || ""} placeholder="Observaciones internas" />
                    <FormSubmitButton className="md:col-span-2" idleLabel="Guardar reglas comerciales" pendingLabel="Guardando política…" />
                  </StaffPolicyForm>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <ReadOnlyField label="Tipo de comision" value={commissionTypes.find(([value]) => value === seller.commissionType)?.[1] || seller.commissionType} />
                    <ReadOnlyField label="Comision" value={seller.commissionType === "FIXED_AMOUNT" ? `${staffFixedCommissionCurrency(seller.tools) || "Moneda pendiente"} ${seller.fixedCommission.toFixed(2)}` : `${seller.commissionRate.toFixed(2)}%`} />
                    <ReadOnlyField label="Meta mensual" value={commercialMoney(seller.monthlyGoal, null)} />
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
                    <td className="p-3">{commercialMoney(commission.baseAmount, commission.quote?.currency)}</td>
                    <td className="p-3 font-semibold">{commercialMoney(commission.amount, commission.quote?.currency)}</td>
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
