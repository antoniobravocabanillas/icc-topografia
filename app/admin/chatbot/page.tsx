import { Bot, CheckCircle2, HelpCircle, MessageSquareWarning } from "lucide-react";
import type { ElementType } from "react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { reviewBotQuestionAction } from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ChatbotAdminPage() {
  await requireAdminPage(["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"]);
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  await requireWorkspaceModule("CUSTOMER_CHAT", terraqoWorkspaceId);

  const [conversations, unanswered, faqs] = await Promise.all([
    prisma.botConversation.findMany({
      where: { terraqoWorkspaceId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
      take: 30
    }),
    prisma.botUnansweredQuestion.findMany({
      where: { terraqoWorkspaceId },
      orderBy: [{ status: "asc" }, { frequency: "desc" }, { updatedAt: "desc" }],
      take: 80
    }),
    prisma.faq.findMany({ where: { active: true, approved: true, terraqoWorkspaceId }, orderBy: [{ usageCount: "desc" }, { position: "asc" }], take: 20 })
  ]);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Asistente inteligente</p>
        <h1 className="font-display text-3xl font-bold">Chatbot y FAQ dinamica</h1>
        <p className="mt-2 text-muted-foreground">Bot local con base de conocimiento. Las preguntas sin respuesta se convierten en sugerencias FAQ aprobables.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        <Metric icon={Bot} label="Conversaciones bot" value={conversations.length} />
        <Metric icon={MessageSquareWarning} label="Por revisar" value={unanswered.filter((item) => item.status === "PENDING").length} />
        <Metric icon={CheckCircle2} label="FAQ aprobadas" value={faqs.length} />
        <Metric icon={HelpCircle} label="Uso FAQ" value={faqs.reduce((sum, faq) => sum + faq.usageCount, 0)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preguntas por revisar</CardTitle>
          <CardDescription>Cuando el bot no encuentra confianza suficiente, registra la pregunta y permite aprobar una respuesta como FAQ publica.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {unanswered.map((question) => (
            <div key={question.id} className="rounded-lg border bg-background p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-semibold">{question.question}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Frecuencia: {question.frequency} | Fuente: {question.source || "chatbot"}</p>
                </div>
                <StatusBadge status={question.status} />
              </div>
              <form action={reviewBotQuestionAction.bind(null, question.id)} className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_160px_auto]">
                <Textarea name="answer" placeholder="Respuesta sugerida para FAQ" defaultValue={question.answer || ""} />
                <Input name="category" placeholder="categoria" defaultValue={question.category || "atencion"} />
                <select name="status" defaultValue={question.status} className="h-11 rounded-md border bg-background px-3 text-sm">
                  <option value="PENDING">Pendiente</option>
                  <option value="APPROVED">Aprobar FAQ</option>
                  <option value="REJECTED">Rechazar</option>
                </select>
                <Button type="submit">Guardar</Button>
              </form>
            </div>
          ))}
          {!unanswered.length ? <p className="text-sm text-muted-foreground">No hay preguntas pendientes.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conversaciones recientes</CardTitle>
          <CardDescription>Trazabilidad de preguntas, respuestas, fuente y derivaciones humanas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {conversations.map((conversation) => (
            <div key={conversation.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{conversation.customerName || "Visitante web"}</p>
                <span className="text-xs text-muted-foreground">{conversation.status}</span>
              </div>
              <div className="mt-3 grid gap-2">
                {conversation.messages.map((message) => (
                  <div key={message.id} className="rounded-md bg-muted/40 p-3 text-sm">
                    <p className="font-semibold">{message.sender === "bot" ? "Bot ICC" : "Cliente"}</p>
                    <p className="mt-1 text-muted-foreground">{message.body}</p>
                    {message.source ? <p className="mt-2 text-xs text-primary">Fuente: {message.source}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: ElementType; label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <Icon className="h-5 w-5 text-primary" />
        <CardTitle className="text-3xl">{value}</CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
    </Card>
  );
}
