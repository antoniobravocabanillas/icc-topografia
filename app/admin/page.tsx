import Link from "next/link";
import { CompanyPriorities } from "@/components/admin/company-priorities";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";
import { Activity, Banknote, BriefcaseBusiness, Clock3, MessagesSquare, UsersRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspace } from "@/lib/terraqo/workspace-scope";
import { terraqoModules } from "@/lib/workspace";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await requireAdminPage(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);
  const params = await searchParams;
  if (session.user.role === "SUPER_ADMIN" && params.view !== "workspace") redirect("/admin/terraqo");
  const activeWorkspace = await getSessionTerraqoWorkspace();
  const terraqoWorkspaceId = activeWorkspace.id;
  if (["TECHNICIAN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"].includes(session.user.role || "")) {
    const profile = await prisma.staffProfile.findFirst({ where: { userId: session.user.id, terraqoWorkspaceId } });
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
            <p className="text-sm font-semibold uppercase text-primary">Panel {activeWorkspace.name}</p>
            <h1 className="font-display text-3xl font-bold">Bandeja tecnica</h1>
            <p className="mt-2 text-muted-foreground">{profile ? `Operacion asignada a ${profile.displayName}` : "Tu usuario aun no tiene perfil vinculado."}</p>
          </div>
          <Button asChild><Link href="/admin/chat">Ver mis chats</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/tickets">Ver tickets</Link></Button>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Card className="rounded-xl border bg-white bg-none shadow-none">
            <CardHeader>
              <CardDescription>Asignados a tu perfil</CardDescription>
              <CardTitle className="text-3xl">{assignedChats.length}</CardTitle>
              <p className="text-sm font-semibold">Chats</p>
            </CardHeader>
          </Card>
          <Card className="rounded-xl border bg-white bg-none shadow-none">
            <CardHeader>
              <CardDescription>Perfil operativo</CardDescription>
              <CardTitle className="text-xl">{profile?.roleTitle || "Sin perfil"}</CardTitle>
              <p className="text-sm font-semibold">Especialidad</p>
            </CardHeader>
          </Card>
          <Card className="rounded-xl border bg-white bg-none shadow-none">
            <CardHeader>
              <CardDescription>Soporte asignado</CardDescription>
              <CardTitle className="text-3xl">{assignedTickets.length}</CardTitle>
              <p className="text-sm font-semibold">Tickets activos</p>
            </CardHeader>
          </Card>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card className="rounded-xl border bg-white bg-none shadow-none">
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
        <Card className="rounded-xl border bg-white bg-none shadow-none">
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
    acceptedQuoteTotals,
    pendingCommissions,
    activeProjects,
    rentableProducts,
    openTickets,
    activeModules
  ] = await prisma.$transaction([
    prisma.product.count({ where: { isActive: true, terraqoWorkspaceId } }),
    prisma.order.count({ where: { status: "PENDING", terraqoWorkspaceId } }),
    prisma.lead.count({ where: { status: "NEW", terraqoWorkspaceId } }),
    prisma.chatConversation.count({ where: { status: "WAITING", terraqoWorkspaceId } }),
    prisma.lead.findMany({ where: { terraqoWorkspaceId }, include: { assignedProfile: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.quote.count({ where: { status: { in: ["DRAFT", "SENT", "VIEWED"] }, terraqoWorkspaceId } }),
    prisma.quote.count({ where: { status: "ACCEPTED", terraqoWorkspaceId } }),
    prisma.quote.count({ where: { status: "REJECTED", terraqoWorkspaceId } }),
    prisma.quote.groupBy({ by: ["currency"], orderBy: { currency: "asc" }, where: { status: "ACCEPTED", terraqoWorkspaceId }, _sum: { total: true } }),
    prisma.commission.count({ where: { status: { in: ["PENDING", "APPROVED"] }, terraqoWorkspaceId } }),
    prisma.project.count({ where: { status: { in: ["PLANNING", "IN_PROGRESS"] }, terraqoWorkspaceId } }),
    prisma.product.count({ where: { isActive: true, terraqoWorkspaceId, commercialMode: { in: ["alquiler", "ambos"] } } }),
    prisma.ticket.count({ where: { status: { in: ["OPEN", "REVIEWING", "IN_PROGRESS", "WAITING_CUSTOMER"] }, terraqoWorkspaceId } }),
    prisma.terraqoWorkspaceModule.findMany({ where: { workspaceId: terraqoWorkspaceId, active: true }, select: { code: true } })
  ]);
  const conversionRate = wonQuotes + lostQuotes ? Math.round((wonQuotes / (wonQuotes + lostQuotes)) * 100) : 0;
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [localYear, localMonth, localDay] = localDate.split("-").map(Number);
  const todayStart = new Date(Date.UTC(localYear, localMonth - 1, localDay, 5));
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);
  const [professionalCount, activeRelationships, pendingAttendanceApprovals, requestedAdjustments, submittedPeriods, attendanceToday] = await prisma.$transaction([
    prisma.terraqoWorkspaceMember.count({ where: { workspaceId: terraqoWorkspaceId, active: true, role: "PROFESSIONAL" } }),
    prisma.terraqoWorkRelationship.count({ where: { workspaceId: terraqoWorkspaceId, status: "ACTIVE", member: { active: true } } }),
    prisma.terraqoAttendanceApproval.count({ where: { workRelationship: { workspaceId: terraqoWorkspaceId }, status: "PENDING" } }),
    prisma.terraqoAttendanceAdjustment.count({ where: { workRelationship: { workspaceId: terraqoWorkspaceId }, status: "REQUESTED" } }),
    prisma.terraqoAttendancePeriod.count({ where: { workRelationship: { workspaceId: terraqoWorkspaceId }, status: "SUBMITTED" } }),
    prisma.terraqoAttendanceEvent.findMany({ where: { workspaceId: terraqoWorkspaceId, type: "CHECK_IN", status: "ACCEPTED", capturedAt: { gte: todayStart, lt: todayEnd } }, distinct: ["userId"], select: { userId: true } }),
  ]);
  const chatEnabled = activeModules.some(module => module.code === "CUSTOMER_CHAT");
  const [overdueFollowups, followupsToday] = chatEnabled ? await Promise.all([
    prisma.chatConversation.count({ where: { terraqoWorkspaceId, status: { not: "CLOSED" }, nextActionCompletedAt: null, nextActionAt: { lt: new Date() } } }),
    prisma.chatConversation.findMany({ where: { terraqoWorkspaceId, status: { not: "CLOSED" }, nextActionCompletedAt: null, nextActionAt: { gte: todayStart, lt: todayEnd } }, select: { id: true, customerName: true, nextAction: true, nextActionAt: true }, orderBy: { nextActionAt: "asc" }, take: 6 }),
  ]) : [0, []];
  const peopleConfigurationPending = Math.max(0, professionalCount - activeRelationships);

  return (
    <div className="space-y-7 pb-20">
      <header className="flex flex-wrap items-start justify-between gap-4 pb-2">
        <div><h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Tu empresa, en perspectiva.</h1><p className="mt-3 text-muted-foreground">{activeWorkspace.name} · Prioridades, actividad y resultados en un solo lugar.</p></div>
        {chatEnabled && <Button asChild><Link href="/admin/chat"><MessagesSquare className="mr-2 h-4 w-4" />Abrir atención</Link></Button>}
      </header>
      <div className="grid grid-cols-2 gap-y-6 border-y py-6 lg:grid-cols-4">{[
        { label: "Consultas por responder", value: chatEnabled ? waitingChats : "—", href: "/admin/chat", icon: MessagesSquare },
        { label: "Seguimientos vencidos", value: chatEnabled ? overdueFollowups : "—", href: "/admin/chat?filter=overdue", icon: Clock3 },
        { label: "Cotizaciones pendientes", value: pendingQuotes, href: "/admin/cotizaciones", icon: BriefcaseBusiness },
        { label: "Proyectos activos", value: activeProjects, href: "/admin/proyectos", icon: Activity },
      ].map(({ label, value, href, icon: Icon }) => <div key={label} className="flex items-start gap-3 px-3 sm:px-5"><Icon className="mt-1 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm text-muted-foreground">{label}</p><strong className="mt-2 block text-3xl font-semibold tabular-nums">{value}</strong>{value !== "—" && <Link href={href} className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-primary">Ver detalle →</Link>}</div></div>)}</div>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <CompanyPriorities items={[
          ...(chatEnabled ? [{ label: "Consultas sin responder", count: waitingChats, href: "/admin/chat", category: "Atención" as const, action: "Atender" }, { label: "Seguimientos vencidos", count: overdueFollowups, href: "/admin/chat?filter=overdue", category: "Atención" as const, action: "Revisar" }] : []),
          { label: "Leads nuevos", count: newLeads, href: "/admin/leads", category: "Comercial", action: "Revisar" },
          { label: "Horas por aprobar", count: pendingAttendanceApprovals, href: "/admin/jornadas", category: "Operación", action: "Abrir" },
          { label: "Incidencias", count: requestedAdjustments, href: "/admin/jornadas", category: "Operación", action: "Revisar" },
          { label: "Cierres mensuales", count: submittedPeriods, href: "/admin/jornadas", category: "Operación", action: "Abrir" },
          { label: "Relaciones por configurar", count: peopleConfigurationPending, href: "/admin/personal", category: "Operación", action: "Completar" },
        ]} />
        <section className="rounded-xl border bg-white p-5 sm:p-6"><h2 className="text-xl font-semibold tracking-tight">Agenda de hoy</h2><p className="mt-2 text-sm text-muted-foreground">Seguimientos programados · Hora de Perú</p><div className="mt-5 divide-y">{followupsToday.map(item => <Link key={item.id} href={"/admin/chat?conversation=" + encodeURIComponent(item.id)} className="flex min-h-20 gap-4 py-4"><time className="text-sm font-medium tabular-nums text-primary">{item.nextActionAt?.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false })}</time><span className="min-w-0"><strong className="block break-words text-sm font-medium">{item.nextAction}</strong><span className="text-xs text-muted-foreground">{item.customerName}</span></span></Link>)}</div>{!followupsToday.length && <p className="py-10 text-sm leading-6 text-muted-foreground">{chatEnabled ? "No tienes seguimientos programados para hoy. Puedes agendar el próximo paso desde cada conversación." : "La atención al cliente no está habilitada en este workspace."}</p>}</section>
      </div>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="overflow-hidden rounded-xl border bg-white bg-none shadow-none">
          <CardHeader className="border-b border-[#e5ebf1]"><CardTitle>Operación y personas</CardTitle><CardDescription>Capacidad actual y preparación administrativa del equipo.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-2"><Link href="/admin/personal" className="border-b border-[#e5ebf1] py-3 transition-colors hover:bg-[#f7fafc]"><UsersRound className="h-5 w-5 text-[#245da7]" /><strong className="mt-3 block text-xl">{professionalCount} profesionales</strong><span className="mt-1 block text-sm text-[#607083]">{activeRelationships} relaciones configuradas</span></Link><Link href="/admin/jornadas" className="border-b border-[#e5ebf1] py-3 transition-colors hover:bg-[#f7fafc]"><Clock3 className="h-5 w-5 text-[#087b70]" /><strong className="mt-3 block text-xl">{attendanceToday.length} en jornada</strong><span className="mt-1 block text-sm text-[#607083]">Seguimiento de asistencia de hoy</span></Link><Link href="/admin/proyectos" className="border-b border-[#e5ebf1] py-3 transition-colors hover:bg-[#f7fafc]"><BriefcaseBusiness className="h-5 w-5 text-amber-600" /><strong className="mt-3 block text-xl">{activeProjects} proyectos</strong><span className="mt-1 block text-sm text-[#607083]">En planificación o ejecución</span></Link><Link href="/admin/nomina" className="border-b border-[#e5ebf1] py-3 transition-colors hover:bg-[#f7fafc]"><Banknote className="h-5 w-5 text-violet-600" /><strong className="mt-3 block text-xl">Preparar pagos</strong><span className="mt-1 block text-sm text-[#607083]">Validar cierres y compensaciones</span></Link></CardContent>
        </section>
        <section className="rounded-xl border bg-white bg-none shadow-none">
          <CardHeader>
            <CardTitle>Rendimiento comercial</CardTitle>
            <CardDescription>Conversión, demanda y valor aceptado.</CardDescription>
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

              </div>
            ))}
            <div className="grid grid-cols-2 gap-3 border-t pt-4"><div><strong className="text-2xl">{conversionRate}%</strong><span className="block text-xs text-muted-foreground">tasa de cierre</span></div><div>{acceptedQuoteTotals.length ? acceptedQuoteTotals.map(item => <strong key={item.currency} className="block text-xl tabular-nums">{item.currency} {Number(item._sum?.total || 0).toLocaleString("es-PE", { maximumFractionDigits: 2 })}</strong>) : <strong className="text-xl">—</strong>}<span className="block text-xs text-muted-foreground">cotizaciones aceptadas · acumulado</span></div></div>
          </CardContent>
        </section>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-xl border bg-white bg-none shadow-none">
          <CardHeader>
            <CardTitle>Capacidades del workspace</CardTitle>
            <CardDescription>Productos Terraqo habilitados para {activeWorkspace.name}.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {activeModules.map(({ code }) => terraqoModules.find((module) => module.code === code)).filter((module): module is NonNullable<typeof module> => Boolean(module)).map((module) => (
              <div key={module.code} className="rounded-md border bg-muted/30 p-4">
                <p className="text-sm font-semibold">{module.label}</p>
                <p className="mt-2 text-xs text-muted-foreground">{module.description}</p>
              </div>
            ))}
          </CardContent>
        </section>
      <section className="rounded-xl border bg-white bg-none shadow-none">
        <CardHeader>
          <CardTitle>Actividad comercial reciente</CardTitle>
          <CardDescription>Solicitudes que el equipo debe convertir o descartar.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
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
                {!recentLeads.length && <tr><td colSpan={4} className="p-5 text-sm text-muted-foreground">Las nuevas consultas comerciales aparecerán aquí.</td></tr>}
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
      </section>
      </section>
      <div className="sr-only">Productos {productCount}; pedidos pendientes {pendingOrders}; comisiones pendientes {pendingCommissions}; equipos en alquiler {rentableProducts}; tickets abiertos {openTickets}.</div>
    </div>
  );
}
