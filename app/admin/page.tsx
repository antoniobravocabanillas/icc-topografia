import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";
import { Activity, ArrowRight, Banknote, BriefcaseBusiness, Clock3, MessagesSquare, ShieldAlert, TrendingUp, UsersRound } from "lucide-react";
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
    prisma.quote.aggregate({ where: { status: "ACCEPTED", terraqoWorkspaceId }, _sum: { total: true } }),
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
  const peopleConfigurationPending = Math.max(0, professionalCount - activeRelationships);
  const attentionTotal = pendingAttendanceApprovals + requestedAdjustments + submittedPeriods + peopleConfigurationPending + newLeads + waitingChats;

  return (
    <main className="space-y-6">
      <header className="overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_82%_15%,rgba(65,166,176,0.34),transparent_30%),linear-gradient(125deg,#091c2b_0%,#0c4050_56%,#0b6a6b_100%)] px-6 py-7 text-white shadow-[0_28px_80px_-48px_rgba(5,43,53,0.9)] sm:px-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200">Centro de operaciones</p><h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{activeWorkspace.name}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">Personas, proyectos, clientes y decisiones financieras en una sola vista ejecutiva.</p></div><div className="flex flex-wrap gap-2"><Link href="/admin/personal" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-bold hover:bg-white/15">Gestionar personas <UsersRound className="h-4 w-4" /></Link><Link href="/admin/nomina" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-[#0c5260]">Preparar nómina <Banknote className="h-4 w-4" /></Link></div></div>
        <div className="mt-7 grid gap-px overflow-hidden rounded-xl border border-white/12 bg-white/12 sm:grid-cols-2 xl:grid-cols-5">{[
          { label: "Equipo activo", value: activeRelationships, icon: UsersRound },
          { label: "En jornada hoy", value: attendanceToday.length, icon: Clock3 },
          { label: "Proyectos activos", value: activeProjects, icon: BriefcaseBusiness },
          { label: "Leads nuevos", value: newLeads, icon: TrendingUp },
          { label: "Requieren atención", value: attentionTotal, icon: ShieldAlert },
        ].map(({ label, value, icon: Icon }) => <div key={label} className="bg-[#0b3141]/84 p-4"><Icon className="h-4 w-4 text-cyan-200" /><strong className="mt-3 block text-2xl tabular-nums">{value}</strong><span className="text-xs text-white/62">{label}</span></div>)}</div>
      </header>

      <section className="rounded-2xl border border-[#d8e0ec] bg-white p-5 shadow-[0_18px_50px_-42px_rgba(14,26,38,0.45)]"><div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-rose-600">Prioridad operativa</p><h2 className="mt-1 font-display text-2xl font-bold">Requiere tu atención</h2></div><span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-bold text-rose-700">{attentionTotal}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[
        { label: "Horas por aprobar", value: pendingAttendanceApprovals, href: "/admin/jornadas", tone: "bg-amber-50 text-amber-900", icon: Clock3 },
        { label: "Incidencias", value: requestedAdjustments, href: "/admin/jornadas", tone: "bg-rose-50 text-rose-900", icon: ShieldAlert },
        { label: "Cierres mensuales", value: submittedPeriods, href: "/admin/jornadas", tone: "bg-blue-50 text-blue-900", icon: Activity },
        { label: "Relaciones pendientes", value: peopleConfigurationPending, href: "/admin/personal", tone: "bg-violet-50 text-violet-900", icon: UsersRound },
        { label: "Leads nuevos", value: newLeads, href: "/admin/leads", tone: "bg-emerald-50 text-emerald-900", icon: TrendingUp },
        { label: "Chats esperando", value: waitingChats, href: "/admin/chat", tone: "bg-cyan-50 text-cyan-900", icon: MessagesSquare },
      ].map(({ label, value, href, tone, icon: Icon }) => <Link key={label} href={href} className={`group rounded-xl p-4 ${tone}`}><div className="flex items-start justify-between"><Icon className="h-5 w-5" /><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div><strong className="mt-4 block text-2xl">{value}</strong><span className="text-xs font-semibold">{label}</span></Link>)}</div></section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden rounded-2xl">
          <CardHeader className="border-b border-[#e5ebf1]"><CardTitle>Operación y personas</CardTitle><CardDescription>Capacidad actual y preparación administrativa del equipo.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-2"><Link href="/admin/personal" className="rounded-xl border border-[#d8e0ec] p-4 transition-colors hover:bg-[#f7fafc]"><UsersRound className="h-5 w-5 text-[#245da7]" /><strong className="mt-3 block text-xl">{professionalCount} profesionales</strong><span className="mt-1 block text-sm text-[#607083]">{activeRelationships} relaciones configuradas</span></Link><Link href="/admin/jornadas" className="rounded-xl border border-[#d8e0ec] p-4 transition-colors hover:bg-[#f7fafc]"><Clock3 className="h-5 w-5 text-[#087b70]" /><strong className="mt-3 block text-xl">{attendanceToday.length} en jornada</strong><span className="mt-1 block text-sm text-[#607083]">Seguimiento de asistencia de hoy</span></Link><Link href="/admin/proyectos" className="rounded-xl border border-[#d8e0ec] p-4 transition-colors hover:bg-[#f7fafc]"><BriefcaseBusiness className="h-5 w-5 text-amber-600" /><strong className="mt-3 block text-xl">{activeProjects} proyectos</strong><span className="mt-1 block text-sm text-[#607083]">En planificación o ejecución</span></Link><Link href="/admin/nomina" className="rounded-xl border border-[#d8e0ec] p-4 transition-colors hover:bg-[#f7fafc]"><Banknote className="h-5 w-5 text-violet-600" /><strong className="mt-3 block text-xl">Preparar pagos</strong><span className="mt-1 block text-sm text-[#607083]">Validar cierres y compensaciones</span></Link></CardContent>
        </Card>
        <Card>
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
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-[#4374ba]" style={{ width: `${Math.min(Number(value) * 12, 100)}%` }} />
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3 border-t pt-4"><div><strong className="text-2xl">{conversionRate}%</strong><span className="block text-xs text-muted-foreground">tasa de cierre</span></div><div><strong className="text-2xl">USD {Number(acceptedQuoteSum._sum.total || 0).toLocaleString("en-US")}</strong><span className="block text-xs text-muted-foreground">ventas aceptadas</span></div></div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Capacidades del workspace</CardTitle>
            <CardDescription>Productos Terraqo habilitados para {activeWorkspace.name} segun su suscripcion.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {activeModules.map(({ code }) => terraqoModules.find((module) => module.code === code)).filter((module): module is NonNullable<typeof module> => Boolean(module)).map((module) => (
              <div key={module.code} className="rounded-md border bg-muted/30 p-4">
                <p className="text-sm font-semibold">{module.label}</p>
                <p className="mt-2 text-xs text-muted-foreground">{module.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Actividad comercial reciente</CardTitle>
          <CardDescription>Solicitudes que el equipo debe convertir o descartar.</CardDescription>
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
      <div className="sr-only">Productos {productCount}; pedidos pendientes {pendingOrders}; comisiones pendientes {pendingCommissions}; equipos en alquiler {rentableProducts}; tickets abiertos {openTickets}.</div>
    </main>
  );
}
