import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { workspace } from "@/lib/workspace";

export default async function AdminPage() {
  const session = await requireAdminPage(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  if (["TECHNICIAN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"].includes(session.user.role || "")) {
    const profile = await prisma.staffProfile.findUnique({ where: { userId: session.user.id } });
    const [assignedChats, assignedTickets, assignedProjects] = profile
      ? await Promise.all([
          prisma.chatConversation.findMany({
            where: { assignedProfileId: profile.id, terraqoWorkspaceId },
            include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
            orderBy: { updatedAt: "desc" },
            take: 8
          }),
          prisma.ticket.findMany({
            where: { assignedProfileId: profile.id, terraqoWorkspaceId, status: { notIn: ["RESOLVED", "CLOSED"] } },
            orderBy: { updatedAt: "desc" },
            take: 8
          }),
          prisma.projectMember.findMany({
            where: { staffProfileId: profile.id, project: { terraqoWorkspaceId } },
            include: { project: true },
            take: 8
          })
        ])
      : [[], [], []];

    return (
      <section>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase text-primary">{workspace.currentPanel}</p>
            <h1 className="font-display text-3xl font-bold">Bandeja tecnica</h1>
            <p className="mt-2 text-muted-foreground">{profile ? `Operacion asignada a ${profile.displayName}` : "Tu usuario aun no tiene perfil vinculado."}</p>
          </div>
          <Button asChild><Link href="/admin/chat">Ver mis chats</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/tickets">Ver tickets</Link></Button>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Asignados a tu perfil</CardDescription>
              <CardTitle className="text-3xl">{assignedChats.length}</CardTitle>
              <p className="text-sm font-semibold">Chats</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Perfil operativo</CardDescription>
              <CardTitle className="text-xl">{profile?.roleTitle || "Sin perfil"}</CardTitle>
              <p className="text-sm font-semibold">Especialidad</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Soporte asignado</CardDescription>
              <CardTitle className="text-3xl">{assignedTickets.length}</CardTitle>
              <p className="text-sm font-semibold">Tickets activos</p>
            </CardHeader>
          </Card>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mis chats recientes</CardTitle>
            <CardDescription>Conversaciones asignadas por administracion comercial.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignedChats.map((chat) => (
              <div key={chat.id} className="rounded-md border p-3">
                <p className="font-semibold">{chat.customerName}</p>
                <p className="text-sm text-muted-foreground">{chat.topic || "Consulta general"} | {chat.status}</p>
              </div>
            ))}
            {!assignedChats.length ? <p className="text-sm text-muted-foreground">Todavia no tienes chats asignados.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mis proyectos y tickets</CardTitle>
            <CardDescription>Asignaciones tecnicas activas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignedProjects.map((member) => (
              <div key={member.id} className="rounded-md border p-3">
                <p className="font-semibold">{member.project.title}</p>
                <p className="text-sm text-muted-foreground">{member.role} | {member.project.status}</p>
              </div>
            ))}
            {assignedTickets.map((ticket) => (
              <div key={ticket.id} className="rounded-md border p-3">
                <p className="font-semibold">{ticket.code} - {ticket.subject}</p>
                <p className="text-sm text-muted-foreground">{ticket.status}</p>
              </div>
            ))}
            {!assignedProjects.length && !assignedTickets.length ? <p className="text-sm text-muted-foreground">Sin asignaciones activas.</p> : null}
          </CardContent>
        </Card>
        </div>
      </section>
    );
  }

  const [
    productCount,
    pendingOrders,
    newLeads,
    waitingChats,
    recentLeads,
    pendingQuotes,
    wonQuotes,
    lostQuotes,
    acceptedQuoteSum,
    pendingCommissions,
    activeProjects,
    rentableProducts,
    openTickets
  ] = await prisma.$transaction([
    prisma.product.count({ where: { isActive: true, terraqoWorkspaceId } }),
    prisma.order.count({ where: { status: "PENDING", terraqoWorkspaceId } }),
    prisma.lead.count({ where: { status: "NEW", terraqoWorkspaceId } }),
    prisma.chatConversation.count({ where: { status: "WAITING", terraqoWorkspaceId } }),
    prisma.lead.findMany({ where: { terraqoWorkspaceId }, include: { assignedProfile: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.quote.count({ where: { status: { in: ["DRAFT", "SENT", "VIEWED"] }, terraqoWorkspaceId } }),
    prisma.quote.count({ where: { status: "ACCEPTED", terraqoWorkspaceId } }),
    prisma.quote.count({ where: { status: "REJECTED", terraqoWorkspaceId } }),
    prisma.quote.aggregate({ where: { status: "ACCEPTED", terraqoWorkspaceId }, _sum: { total: true } }),
    prisma.commission.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
    prisma.project.count({ where: { status: { in: ["PLANNING", "IN_PROGRESS"] }, terraqoWorkspaceId } }),
    prisma.product.count({ where: { isActive: true, terraqoWorkspaceId, commercialMode: { in: ["alquiler", "ambos"] } } }),
    prisma.ticket.count({ where: { status: { in: ["OPEN", "REVIEWING", "IN_PROGRESS", "WAITING_CUSTOMER"] }, terraqoWorkspaceId } })
  ]);
  const conversionRate = wonQuotes + lostQuotes ? Math.round((wonQuotes / (wonQuotes + lostQuotes)) * 100) : 0;

  return (
    <section>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-primary">{workspace.name}</p>
          <h1 className="font-display text-3xl font-bold">{workspace.currentPanel}</h1>
          <p className="mt-2 text-muted-foreground">{workspace.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/admin/cotizaciones">Cotizaciones</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/ventas">Ventas</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/chat">Ver chat</Link></Button>
          <Button asChild><Link href="/admin/leads">Ver leads</Link></Button>
        </div>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-4">
        {[
          ["Productos", productCount, "Catalogo tecnico"],
          ["Pedidos pendientes", pendingOrders, "Ordenes por revisar"],
          ["Leads nuevos", newLeads, "Cotizaciones entrantes"],
          ["Chats esperando", waitingChats, "Atencion en linea"],
          ["Cotizaciones pendientes", pendingQuotes, "DRAFT / SENT / VIEWED"],
          ["Ventas aceptadas", `USD ${Number(acceptedQuoteSum._sum.total || 0).toLocaleString("en-US")}`, "Ingresos estimados"],
          ["Comisiones pendientes", pendingCommissions, "Por aprobar o pagar"],
          ["Proyectos activos", activeProjects, "Planificacion / ejecucion"],
          ["Equipos alquiler", rentableProducts, "Disponibles para renta"],
          ["Tickets abiertos", openTickets, "Soporte y garantia"],
          ["Tasa cierre", `${conversionRate}%`, "Ganadas vs perdidas"]
        ].map(([title, value, text]) => (
          <Card key={String(title)}>
            <CardHeader>
              <CardDescription>{text}</CardDescription>
              <CardTitle className="text-3xl">{value}</CardTitle>
              <p className="text-sm font-semibold">{title}</p>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Embudo comercial</CardTitle>
            <CardDescription>Lectura rapida de oportunidades y cierre.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              ["Leads nuevos", newLeads],
              ["Cotizaciones pendientes", pendingQuotes],
              ["Cotizaciones ganadas", wonQuotes],
              ["Cotizaciones perdidas", lostQuotes]
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-semibold">{value}</span></div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(Number(value) * 12, 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lineas operativas de ICC Topografia</CardTitle>
            <CardDescription>Base compartida para servicios, productos, alquiler, soporte y futura productizacion Terraqo.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {["Servicios topograficos", "Venta de equipos", "Alquiler", "Soporte/calibracion"].map((line) => (
              <div key={line} className="rounded-md border bg-muted/30 p-4">
                <p className="text-sm font-semibold">{line}</p>
                <p className="mt-2 text-xs text-muted-foreground">Reporte preparado para Fase 2.</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Leads recientes</CardTitle>
          <CardDescription>Ultimas solicitudes de cotizacion registradas desde la web.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Origen</th>
                  <th className="p-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{lead.name}</div>
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    </td>
                    <td className="p-3">{lead.company || "-"}</td>
                    <td className="p-3">{lead.source || "web"}</td>
                    <td className="p-3">
                      <StatusBadge status={lead.status} />
                      <p className="mt-1 text-xs text-muted-foreground">{lead.assignedProfile?.displayName || "Sin vendedor"}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
