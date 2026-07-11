import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { sendTicketMessageAction, updateTicketAction } from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

const ticketStatuses = ["OPEN", "REVIEWING", "WAITING_CUSTOMER", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const ticketPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const ticketCategories = ["EQUIPMENT", "SERVICE", "CALIBRATION", "REPAIR", "WARRANTY", "TECHNICAL_QUERY", "OTHER"];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminTicketsPage() {
  await requireAdminPage(["SUPPORT", "TECHNICIAN", "SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  await requireWorkspaceModule("CRM", terraqoWorkspaceId);
  const [tickets, profiles] = await Promise.all([
    prisma.ticket.findMany({
      where: { terraqoWorkspaceId },
      include: {
        client: true,
        assignedProfile: true,
        messages: { include: { author: true }, orderBy: { createdAt: "asc" } }
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    }),
    prisma.staffProfile.findMany({
      where: { active: true },
      orderBy: { displayName: "asc" }
    })
  ]);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Soporte tecnico</p>
        <h1 className="font-display text-3xl font-bold">Tickets</h1>
        <p className="mt-2 text-muted-foreground">Atencion de calibracion, reparacion, garantia, equipos y consultas tecnicas.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        {ticketStatuses.slice(0, 4).map((status) => (
          <Card key={status}>
            <CardHeader>
              <CardDescription><StatusBadge status={status} /></CardDescription>
              <CardTitle className="text-3xl">{tickets.filter((ticket) => ticket.status === status).length}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-5">
        {tickets.map((ticket) => (
          <Card key={ticket.id}>
            <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>{ticket.code} - {ticket.subject}</CardTitle>
                <CardDescription>
                  {ticket.customerName} | {ticket.company || ticket.customerEmail} | Responsable: {ticket.assignedProfile?.displayName || "Sin asignar"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={ticket.status} />
                <StatusBadge status={ticket.priority} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[340px_1fr]">
              <form action={updateTicketAction.bind(null, ticket.id)} className="grid content-start gap-3 rounded-lg border bg-muted/20 p-4">
                <select name="status" defaultValue={ticket.status} className="h-10 rounded-md border bg-background px-3 text-sm">
                  {ticketStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <select name="priority" defaultValue={ticket.priority} className="h-10 rounded-md border bg-background px-3 text-sm">
                  {ticketPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
                <select name="category" defaultValue={ticket.category} className="h-10 rounded-md border bg-background px-3 text-sm">
                  {ticketCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <select name="assignedProfileId" defaultValue={ticket.assignedProfileId || ""} className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="">Sin responsable</option>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} - {profile.roleTitle}</option>)}
                </select>
                <Button type="submit" variant="outline">Actualizar ticket</Button>
              </form>

              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-semibold">Descripcion inicial</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{ticket.description}</p>
                  {ticket.attachments.length ? (
                    <div className="mt-3 text-xs text-muted-foreground">{ticket.attachments.join(", ")}</div>
                  ) : null}
                </div>
                <div className="grid gap-3">
                  {ticket.messages.map((message) => (
                    <div key={message.id} className="rounded-md border bg-background p-3 text-sm">
                      <p className="font-semibold">{message.sender === "staff" ? message.author?.name || "Equipo ICC" : "Cliente"}</p>
                      <p className="mt-1 leading-6 text-muted-foreground">{message.body}</p>
                    </div>
                  ))}
                </div>
                <form action={sendTicketMessageAction.bind(null, ticket.id)} className="grid gap-3">
                  <Textarea name="body" placeholder="Responder al cliente" required />
                  <Textarea name="files" placeholder="URLs de archivos adjuntos, uno por linea" />
                  <Button type="submit">Responder ticket</Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
        {!tickets.length ? <p className="text-sm text-muted-foreground">Todavia no hay tickets de soporte.</p> : null}
      </div>
    </section>
  );
}

