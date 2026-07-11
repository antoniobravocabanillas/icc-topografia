import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { convertLeadToOpportunityAction, createLeadNoteAction, deleteLeadAction, updateLeadPipelineAction } from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

const leadStatuses = ["NEW", "CONTACTED", "QUALIFIED", "EVALUATION", "QUOTED", "NEGOTIATION", "WON", "LOST", "REQUIRES_TECH_SUPPORT"] as const;
const leadPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export default async function AdminLeadsPage() {
  await requireAdminPage(["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  await requireWorkspaceModule("CRM", terraqoWorkspaceId);
  const [leads, sellers] = await Promise.all([
    prisma.lead.findMany({
      where: { deletedAt: null, terraqoWorkspaceId },
      include: {
        assignedProfile: true,
        notes: { orderBy: { createdAt: "desc" }, take: 3 },
        quotes: true,
        opportunity: true
      },
    orderBy: { createdAt: "desc" },
    take: 100
    }),
    prisma.staffProfile.findMany({ where: { department: "SALES", active: true }, orderBy: { displayName: "asc" } })
  ]);

  return (
    <section>
      <div>
        <h1 className="font-display text-3xl font-bold">Leads y cotizaciones</h1>
        <p className="mt-2 text-muted-foreground">Pipeline comercial para solicitudes, seguimiento, asignacion de vendedor y proxima accion.</p>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Solicitudes registradas</CardTitle>
          <CardDescription>{leads.length} solicitudes encontradas.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Contacto</th>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Interes / mensaje</th>
                  <th className="p-3">Pipeline</th>
                  <th className="p-3">Seguimiento</th>
                  <th className="p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const statusAction = updateLeadPipelineAction.bind(null, lead.id);
                  const noteAction = createLeadNoteAction.bind(null, lead.id);
                  const deleteAction = deleteLeadAction.bind(null, lead.id);
                  const convertAction = convertLeadToOpportunityAction.bind(null, lead.id);
                  return (
                    <tr key={lead.id} className="border-t align-top">
                      <td className="p-3 text-muted-foreground">{lead.createdAt.toLocaleString("es-PE")}</td>
                      <td className="p-3 font-medium">{lead.name}</td>
                      <td className="p-3">
                        <div>{lead.email}</div>
                        <div className="text-xs text-muted-foreground">{lead.phone || "-"}</div>
                      </td>
                      <td className="p-3">{lead.company || "-"}</td>
                      <td className="max-w-sm p-3 leading-6">
                        <div className="font-medium">{lead.interest || lead.source || "Consulta general"}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{lead.message}</p>
                      </td>
                      <td className="space-y-2 p-3">
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge status={lead.status} />
                          <StatusBadge status={lead.priority} />
                        </div>
                        <p className="text-xs text-muted-foreground">{lead.assignedProfile?.displayName || "Sin vendedor"}</p>
                        <p className="text-xs text-muted-foreground">{lead.quotes.length} cotizacion(es)</p>
                      </td>
                      <td className="p-3">
                        <p className="text-xs text-muted-foreground">{lead.nextFollowUpAt ? lead.nextFollowUpAt.toLocaleDateString("es-PE") : "Sin fecha"}</p>
                        <p className="font-semibold">USD {Number(lead.estimatedValue || 0).toLocaleString("en-US")}</p>
                        {lead.notes[0] ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{lead.notes[0].body}</p> : null}
                      </td>
                      <td className="space-y-2 p-3">
                        <form action={statusAction} className="grid gap-2">
                          <select name="status" defaultValue={lead.status} className="h-9 rounded-md border bg-background px-2 text-xs">
                            {leadStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                          <select name="priority" defaultValue={lead.priority} className="h-9 rounded-md border bg-background px-2 text-xs">
                            {leadPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                          </select>
                          <select name="assignedProfileId" defaultValue={lead.assignedProfileId || ""} className="h-9 rounded-md border bg-background px-2 text-xs">
                            <option value="">Sin vendedor</option>
                            {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.displayName}</option>)}
                          </select>
                          <input name="interest" defaultValue={lead.interest || ""} placeholder="Interes" className="h-9 rounded-md border bg-background px-2 text-xs" />
                          <input name="estimatedValue" type="number" step="0.01" defaultValue={String(lead.estimatedValue || "")} placeholder="Monto estimado" className="h-9 rounded-md border bg-background px-2 text-xs" />
                          <input name="nextFollowUpAt" type="date" defaultValue={lead.nextFollowUpAt ? lead.nextFollowUpAt.toISOString().slice(0, 10) : ""} className="h-9 rounded-md border bg-background px-2 text-xs" />
                          <Button type="submit" size="sm" variant="outline">Guardar</Button>
                        </form>
                        <form action={noteAction} className="grid gap-2">
                          <input name="body" placeholder="Nueva nota" className="h-9 rounded-md border bg-background px-2 text-xs" />
                          <Button type="submit" size="sm" variant="outline">Agregar nota</Button>
                        </form>
                        <form action={deleteAction}>
                          <Button type="submit" size="sm" variant="destructive">Archivar</Button>
                        </form>
                        {lead.opportunity ? (
                          <Button size="sm" variant="outline" disabled>Oportunidad creada</Button>
                        ) : (
                          <form action={convertAction}>
                            <Button type="submit" size="sm">Convertir a oportunidad</Button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!leads.length ? (
                  <tr>
                    <td className="p-6 text-center text-muted-foreground" colSpan={8}>Todavia no hay solicitudes registradas.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
