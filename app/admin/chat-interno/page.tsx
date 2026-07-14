import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { createInternalChannelAction, sendInternalMessageAction } from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

const defaultChannels = [
  { name: "General", slug: "general", description: "Coordinacion transversal del equipo ICC." },
  { name: "Ventas", slug: "ventas", description: "Leads, cotizaciones, seguimiento y cierres." },
  { name: "Operaciones", slug: "operaciones", description: "Campo, gabinete y proyectos." },
  { name: "Soporte", slug: "soporte", description: "Tickets, calibracion, reparacion y garantias." },
  { name: "Proyectos", slug: "proyectos", description: "Avances, entregables y coordinacion tecnica." }
];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InternalChatPage() {
  await requireAdminPage(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();

  for (const channel of defaultChannels) {
    const existingChannel = await prisma.internalChatChannel.findFirst({
      where: { slug: channel.slug, terraqoWorkspaceId },
      select: { id: true }
    });
    if (!existingChannel) {
      await prisma.internalChatChannel.create({ data: { ...channel, terraqoWorkspaceId } });
    }
  }

  const [channels, leads, projects, tickets] = await Promise.all([
    prisma.internalChatChannel.findMany({
      where: { terraqoWorkspaceId },
      include: { messages: { include: { user: true }, orderBy: { createdAt: "desc" }, take: 12 } },
      orderBy: { slug: "asc" }
    }),
    prisma.lead.findMany({ where: { terraqoWorkspaceId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.project.findMany({ where: { terraqoWorkspaceId }, orderBy: { updatedAt: "desc" }, take: 30 }),
    prisma.ticket.findMany({ where: { terraqoWorkspaceId, status: { notIn: ["RESOLVED", "CLOSED"] } }, orderBy: { updatedAt: "desc" }, take: 30 })
  ]);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Comunicacion interna</p>
        <h1 className="font-display text-3xl font-bold">Chat interno</h1>
        <p className="mt-2 text-muted-foreground">Canales por area con referencias a leads, proyectos o tickets.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo canal</CardTitle>
          <CardDescription>Para equipos, obras, campanas o coordinaciones recurrentes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createInternalChannelAction} className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
            <Input name="name" placeholder="Nombre del canal" required />
            <Input name="slug" placeholder="slug" />
            <Input name="description" placeholder="Descripcion" />
            <Button type="submit">Crear canal</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-5">
        {channels.map((channel) => (
          <Card key={channel.id}>
            <CardHeader>
              <CardTitle>{channel.name}</CardTitle>
              <CardDescription>{channel.description || "Canal interno ICC"}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <div className="flex max-h-[420px] flex-col-reverse gap-3 overflow-auto rounded-lg border bg-muted/20 p-4">
                {channel.messages.map((message) => (
                  <div key={message.id} className="rounded-md bg-background p-3 text-sm">
                    <p className="font-semibold">{message.user?.name || message.user?.email || "Equipo ICC"}</p>
                    <p className="mt-1 whitespace-pre-line leading-6 text-muted-foreground">{message.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{message.createdAt.toLocaleString("es-PE")}</p>
                  </div>
                ))}
                {!channel.messages.length ? <p className="text-sm text-muted-foreground">Sin mensajes todavia.</p> : null}
              </div>

              <form action={sendInternalMessageAction.bind(null, channel.id)} className="grid content-start gap-3">
                <Textarea name="body" placeholder="Mensaje interno" required />
                <select name="leadId" className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="">Relacionar lead opcional</option>
                  {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name} - {lead.company || lead.email}</option>)}
                </select>
                <select name="projectId" className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="">Relacionar proyecto opcional</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                </select>
                <select name="ticketId" className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="">Relacionar ticket opcional</option>
                  {tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.code} - {ticket.subject}</option>)}
                </select>
                <Textarea name="files" placeholder="URLs de archivos, uno por linea" />
                <Button type="submit">
                  <Send className="h-4 w-4" />
                  Enviar
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

