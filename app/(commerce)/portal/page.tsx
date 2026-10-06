import Link from "next/link";
import { redirect } from "next/navigation";
import type { ElementType } from "react";
import { FileText, FolderKanban, LifeBuoy, ShoppingCart, UserRound } from "lucide-react";
import { auth } from "@/auth";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/forms/submit-button";
import { PortalFileUploader } from "@/components/portal/file-uploader";
import { ProfessionalDashboard, type ProfessionalDashboardData } from "@/components/terraqo/professional-dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { createCustomerTicketAction, replyCustomerTicketAction, respondPublicQuoteFromFormAction, updateClientProfileAction } from "@/lib/server/customer-actions";
import { createMetadata } from "@/lib/seo";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { worklogInclude } from "@/lib/terraqo/worklog";
import { formatCurrency } from "@/lib/utils";

export const metadata = createMetadata({
  title: "Inicio del Portal Terraqo",
  description: "Actividad, tareas, oportunidades y señales de confianza de tu espacio Terraqo.",
  path: "/portal",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClientPortalPageProps = {
  searchParams: Promise<{ success?: string; status?: string; error?:string }>;
};

const ticketCategories = [
  ["EQUIPMENT", "Equipo"],
  ["SERVICE", "Servicio"],
  ["CALIBRATION", "Calibracion"],
  ["REPAIR", "Reparacion"],
  ["WARRANTY", "Garantia"],
  ["TECHNICAL_QUERY", "Consulta tecnica"],
  ["OTHER", "Otro"],
];

const successMessages: Record<string, string> = {
  profile: "Datos actualizados correctamente.",
  username: "Enlace publico del CV actualizado correctamente.",
  ticket: "Ticket creado. El equipo ICC lo revisara y respondera desde soporte.",
  reply: "Respuesta enviada al ticket.",
  quote_accepted: "Cotizacion aceptada. El equipo comercial fue notificado.",
  quote_rejected: "Cotizacion rechazada. El equipo comercial fue notificado.",
  availability: "Disponibilidad actualizada en tu perfil y CV vivo.",
};

const statusMessages: Record<string, string> = {
  "username-invalid": "El usuario debe tener 3 a 30 caracteres: letras minusculas, numeros, punto, guion o guion bajo.",
  "username-taken": "Ese usuario ya esta en uso. Elige otra variante.",
  "profile-required": "Completa tu perfil profesional antes de crear un enlace publico.",
  "availability-invalid": "Selecciona un estado de disponibilidad válido.",
};

export default async function ClientPortalPage({ searchParams }: ClientPortalPageProps) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.email) redirect("/cuenta");
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();

  const account = await prisma.clientAccount.findFirst({
    where: {
      OR: [{ userId: session.user.id }, { user: { email: session.user.email } }],
      terraqoWorkspaceId,
      deletedAt: null,
    },
    include: {
      company: true,
      contact: true,
      client: {
        include: {
          quotes: {
            where: { terraqoWorkspaceId,deletedAt:null,status:{not:"DRAFT"} },
            include: { items: true, sellerProfile: true },
            orderBy: { createdAt: "desc" },
          },
          projects: {
            where: { terraqoWorkspaceId },
            include: {
              images: { orderBy: { position: "asc" }, take: 1 },
              progress: { orderBy: { createdAt: "desc" }, take: 3 },
            },
            orderBy: { updatedAt: "desc" },
          },
          tickets: {
            where: { terraqoWorkspaceId },
            include: {
              assignedProfile: true,
              messages: { orderBy: { createdAt: "asc" } },
            },
            orderBy: { updatedAt: "desc" },
          },
          documents: { orderBy: { createdAt: "desc" } },
          user: {
            select: {
              orders: {
                where: { terraqoWorkspaceId },
                include: {
                  items: {
                    include: {
                      product: { select: { name: true, slug: true } },
                    },
                  },
                },
                orderBy: { createdAt: "desc" },
                take: 30,
              },
            },
          },
        },
      },
    },
  });
  const professionalProfile = await prisma.terraqoProfessionalProfile.findFirst({
    where: {
      OR: [{ userId: session.user.id }, { user: { email: session.user.email } }],
    },
    include: {
      user: { select: { name: true, email: true, image: true } },
      experiences: {
        include: {
          project: {
            select: {
              title: true,
              slug: true,
              location: true,
              images: {
                select: { url: true },
                orderBy: { position: "asc" },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      },
      affiliations: {
        orderBy: [{ current: "desc" }, { updatedAt: "desc" }],
        take: 6,
      },
      applications: {
        include: {
          workspace: { select: { name: true } },
          jobPost: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      },
      documents: {
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          type: true,
          fileName: true,
          contentType: true,
          size: true,
          reviewStatus: true,
          reviewNote: true,
          uploadedAt: true,
        },
      },
      worklogs: {
        where: { deletedAt: null },
        include: worklogInclude,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 4,
      },
    },
  });
  let professionalWorkspaceId: string | null = null;
  let professionalDashboard: ProfessionalDashboardData | null = null;

  if (professionalProfile) {
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

    const memberships = await prisma.terraqoWorkspaceMember.findMany({
      where: {
        userId: professionalProfile.userId,
        active: true,
        role: "PROFESSIONAL",
        workspace: { active: true, deletedAt: null },
      },
      select: { workspaceId: true },
      orderBy: { joinedAt: "desc" },
    });
    professionalWorkspaceId = memberships[0]?.workspaceId || null;
    const workspaceIds = memberships.map((membership) => membership.workspaceId);

    const [participants, pendingTeamInvitations, pendingExperienceValidations, weekWorklogs, weekValidatedWorklogs, weekTrustAggregate, newConnections, totalWorklogs, verifiedExperiences, validationBackings, forumPosts, networkWorklogs, jobPosts, networkValidations] = await Promise.all([
      prisma.terraqoConversationParticipant.findMany({
        where: { userId: professionalProfile.userId, leftAt: null },
        select: { conversationId: true, lastReadAt: true, joinedAt: true },
      }),
      prisma.terraqoTeamMember.count({
        where: {
          userId: professionalProfile.userId,
          status: "INVITED",
          team: { status: "ACTIVE" },
        },
      }),
      prisma.terraqoProfessionalExperience.count({
        where: {
          professionalProfileId: professionalProfile.id,
          verificationStatus: "REQUESTED",
        },
      }),
      prisma.terraqoWorklogEntry.count({
        where: {
          professionalProfileId: professionalProfile.id,
          deletedAt: null,
          occurredAt: { gte: weekStart },
        },
      }),
      prisma.terraqoWorklogEntry.count({
        where: {
          professionalProfileId: professionalProfile.id,
          deletedAt: null,
          occurredAt: { gte: weekStart },
          validations: { some: { status: "APPROVED" } },
        },
      }),
      prisma.terraqoWorklogEntry.aggregate({
        where: {
          professionalProfileId: professionalProfile.id,
          deletedAt: null,
          occurredAt: { gte: weekStart },
        },
        _sum: { trustScoreAwarded: true },
      }),
      prisma.terraqoFriendship.count({
        where: {
          status: "ACCEPTED",
          respondedAt: { gte: weekStart },
          OR: [{ requesterId: professionalProfile.userId }, { recipientId: professionalProfile.userId }],
        },
      }),
      prisma.terraqoWorklogEntry.count({
        where: {
          professionalProfileId: professionalProfile.id,
          deletedAt: null,
        },
      }),
      prisma.terraqoProfessionalExperience.count({
        where: {
          professionalProfileId: professionalProfile.id,
          verifiedByTerraqo: true,
        },
      }),
      prisma.terraqoWorklogValidation.count({
        where: {
          worklog: {
            professionalProfileId: professionalProfile.id,
            deletedAt: null,
          },
          status: "APPROVED",
        },
      }),
      prisma.terraqoForumPost.findMany({
        where: {
          deletedAt: null,
          visibility: { in: ["COMMUNITY", "PUBLIC"] },
          NOT: { authorId: professionalProfile.userId },
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          author: {
            select: {
              name: true,
              image: true,
              terraqoProfessionalProfile: { select: { headline: true } },
            },
          },
          channel: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.terraqoWorklogEntry.findMany({
        where: {
          deletedAt: null,
          visibility: { in: ["COMMUNITY", "PUBLIC"] },
          NOT: { authorId: professionalProfile.userId },
        },
        select: {
          id: true,
          title: true,
          occurredAt: true,
          author: {
            select: {
              name: true,
              image: true,
              terraqoProfessionalProfile: { select: { headline: true } },
            },
          },
          workspace: { select: { brandName: true, name: true, logoUrl: true } },
        },
        orderBy: { occurredAt: "desc" },
        take: 4,
      }),
      prisma.terraqoJobPost.findMany({
        where: {
          status: "OPEN",
          deletedAt: null,
          workspace: {
            active: true,
            modules: { some: { code: "JOB_MARKETPLACE", active: true } },
          },
          OR: [
            { visibility: { in: ["PUBLIC", "COMMUNITY"] } },
            ...(workspaceIds.length
              ? [
                  {
                    visibility: "WORKSPACE" as const,
                    workspaceId: { in: workspaceIds },
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          title: true,
          location: true,
          modality: true,
          requiredSkills: true,
          requiredTools: true,
          professionalCategories: true,
          createdAt: true,
          workspace: {
            select: {
              name: true,
              brandName: true,
              logoUrl: true,
              industry: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.terraqoWorklogValidation.findMany({
        where: {
          status: "APPROVED",
          worklog: {
            deletedAt: null,
            visibility: { in: ["COMMUNITY", "PUBLIC"] },
            NOT: { authorId: professionalProfile.userId },
          },
        },
        select: {
          id: true,
          resolvedAt: true,
          createdAt: true,
          worklog: {
            select: {
              title: true,
              author: {
                select: {
                  name: true,
                  image: true,
                  terraqoProfessionalProfile: { select: { headline: true } },
                },
              },
              workspace: {
                select: { name: true, brandName: true, logoUrl: true },
              },
            },
          },
        },
        orderBy: { resolvedAt: "desc" },
        take: 4,
      }),
    ]);

    const unreadMessages = participants.length
      ? await prisma.terraqoDirectMessage.count({
          where: {
            deletedAt: null,
            senderId: { not: professionalProfile.userId },
            OR: participants.map((participant) => ({
              conversationId: participant.conversationId,
              createdAt: { gt: participant.lastReadAt || participant.joinedAt },
            })),
          },
        })
      : 0;

    const profileTerms = new Set([...professionalProfile.professionalCategories, ...professionalProfile.specialties, ...professionalProfile.equipment, ...professionalProfile.software].map((term) => term.trim().toLocaleLowerCase("es-PE")));
    const rankedJobs = jobPosts
      .map((job) => {
        const candidateTags = [...job.professionalCategories, ...job.requiredSkills, ...job.requiredTools];
        const relatedTags = candidateTags.filter((tag) => profileTerms.has(tag.trim().toLocaleLowerCase("es-PE")));
        const sameLocation = Boolean(job.location && [professionalProfile.locationCity, professionalProfile.city].filter(Boolean).some((city) => job.location?.toLocaleLowerCase("es-PE").includes(String(city).toLocaleLowerCase("es-PE"))));
        return {
          job,
          relatedTags,
          score: relatedTags.length * 2 + Number(sameLocation),
        };
      })
      .sort((a, b) => b.score - a.score || b.job.createdAt.getTime() - a.job.createdAt.getTime());

    const networkUpdates: ProfessionalDashboardData["networkUpdates"] = [
      ...networkWorklogs.map((worklog) => ({
        id: worklog.id,
        kind: "evidence" as const,
        actor: worklog.author.name || "Un profesional",
        action: "publicó una evidencia",
        avatarUrl: worklog.author.image,
        role: worklog.author.terraqoProfessionalProfile?.headline || "Profesional Terraqo",
        title: worklog.title,
        context: worklog.workspace?.brandName || worklog.workspace?.name || null,
        date: worklog.occurredAt,
        href: "/portal/red",
      })),
      ...jobPosts.slice(0, 4).map((job) => ({
        id: job.id,
        kind: "opportunity" as const,
        actor: job.workspace.brandName || job.workspace.name,
        action: "publicó una oportunidad",
        avatarUrl: job.workspace.logoUrl,
        role: job.workspace.industry || "Empresa Terraqo",
        title: job.title,
        context: job.location,
        date: job.createdAt,
        href: "/portal/oportunidades",
      })),
      ...networkValidations.map((validation) => ({
        id: validation.id,
        kind: "validation" as const,
        actor: validation.worklog.author.name || "Un profesional",
        action: "obtuvo una validación",
        avatarUrl: validation.worklog.author.image,
        role: validation.worklog.author.terraqoProfessionalProfile?.headline || "Profesional Terraqo",
        title: validation.worklog.title,
        context: validation.worklog.workspace?.brandName || validation.worklog.workspace?.name || null,
        date: validation.resolvedAt || validation.createdAt,
        href: "/portal/red",
      })),
      ...forumPosts.map((post) => ({
        id: post.id,
        kind: "conversation" as const,
        actor: post.author?.name || "La comunidad Terraqo",
        action: "inició una conversación",
        avatarUrl: post.author?.image || null,
        role: post.author?.terraqoProfessionalProfile?.headline || "Miembro de la comunidad",
        title: post.title,
        context: post.channel.name,
        date: post.createdAt,
        href: "/portal/commons",
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 6);

    professionalDashboard = {
      unreadMessages,
      pendingTeamInvitations,
      pendingExperienceValidations,
      weekWorklogs,
      weekValidatedWorklogs,
      weekTrust: weekTrustAggregate._sum.trustScoreAwarded || 0,
      newConnections,
      totalWorklogs,
      verifiedExperiences,
      validationBackings,
      opportunities: rankedJobs.slice(0, 3).map(({ job, relatedTags }) => ({
        id: job.id,
        title: job.title,
        company: job.workspace.brandName || job.workspace.name,
        logoUrl: job.workspace.logoUrl,
        companyRole: job.workspace.industry || "Empresa Terraqo",
        location: job.location,
        modality: job.modality,
        relatedTags: relatedTags.length ? relatedTags : [...job.professionalCategories, ...job.requiredSkills].slice(0, 2),
      })),
      networkUpdates,
    };
  }

  const activeClientAccount = account && ["active", "approved"].includes(account.status) && account.client?.terraqoWorkspaceId === terraqoWorkspaceId ? account : null;
  const client = activeClientAccount?.client || null;
  const orders = client?.user?.orders || [];
  const publicOrderCode = (notes?: string | null) => notes?.match(/Codigo publico: ([A-Z0-9-]+)/)?.[1] || null;

  if (professionalProfile) {
    return (
      <div className="min-w-0 space-y-8">
        {params.success && successMessages[params.success] ? <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{successMessages[params.success]}</div> : null}
        {params.status && statusMessages[params.status] ? <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{statusMessages[params.status]}</div> : null}
        <ProfessionalDashboard profile={professionalProfile} workspaceId={professionalWorkspaceId} dashboard={professionalDashboard!} />
      </div>
    );
  }

  if (!activeClientAccount || !client) {
    return (
      <div className="max-w-3xl py-8 lg:py-12">
        <Card>
          <CardHeader>
            <CardTitle>Acceso pendiente de validacion</CardTitle>
            <CardDescription>Tu solicitud de portal cliente esta registrada, pero un administrador debe validar empresa, contacto y permisos antes de activar la cuenta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-4 text-sm">
              <p className="font-semibold">Estado actual: {account?.status || "sin solicitud vinculada"}</p>
              <p className="mt-1 text-muted-foreground">Si ya eres cliente ICC, solicita a tu asesor que apruebe tu acceso desde Clientes 360.</p>
            </div>
            <Button asChild>
              <Link href="/contacto">Contactar a ICC</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-8 py-6 lg:py-8">
      {params.error?.startsWith("quote_") ? <p role="alert" className="rounded-md border p-4 text-sm">La cotización cambió, venció o requiere revisión. Abre el detalle y consulta a tu asesor antes de confirmar.</p> : null}
      {params.success && successMessages[params.success] ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{successMessages[params.success]}</div> : null}
      {params.status && statusMessages[params.status] ? <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{statusMessages[params.status]}</div> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border bg-[#03111D] p-7 text-white shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#24C8EE]">Portal ICC</p>
          <h1 className="mt-4 font-display text-4xl font-bold">Operacion del cliente</h1>
          <p className="mt-4 max-w-2xl text-white/72">Consulta tus cotizaciones, tickets de soporte, proyectos contratados y documentos comerciales en un solo lugar.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={ShoppingCart} label="Pedidos" value={orders.length} />
            <Metric icon={FileText} label="Cotizaciones" value={client.quotes.length} />
            <Metric icon={LifeBuoy} label="Tickets" value={client.tickets.length} />
            <Metric icon={FolderKanban} label="Proyectos" value={client.projects.length} />
          </div>
        </div>

        <Card id="cotizaciones" className="scroll-mt-28">
          <CardHeader>
            <CardTitle>Perfil comercial</CardTitle>
            <CardDescription>Datos usados para propuestas, tickets y seguimiento.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateClientProfileAction} className="grid gap-3">
              <Input name="name" defaultValue={client.name} placeholder="Nombre" />
              <Input name="company" defaultValue={client.company || ""} placeholder="Empresa" />
              <Input name="document" defaultValue={client.document || ""} placeholder="RUC / DNI" />
              <Input name="phone" defaultValue={client.phone || ""} placeholder="Telefono" />
              <Input name="address" defaultValue={client.address || ""} placeholder="Direccion" />
              <Input name="contactName" defaultValue={client.contactName || ""} placeholder="Contacto principal" />
              <SubmitButton pendingText="Actualizando...">Actualizar perfil</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pedidos de tienda tecnica</CardTitle>
          <CardDescription>Historial generado desde la tienda conectada al workspace.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {orders.map((order) => (
            <div key={order.id} className="rounded-lg border bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-display text-lg font-bold">{publicOrderCode(order.notes) || order.id}</p>
                  <p className="text-sm text-muted-foreground">{order.items.map((item) => `${item.quantity} x ${item.product.name}`).join(", ")}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{order.createdAt.toLocaleDateString("es-PE")}</p>
                </div>
                <div className="text-left md:text-right">
                  <StatusBadge status={order.status} />
                  <p className="mt-2 font-display text-xl font-bold">{formatCurrency(Number(order.total), order.currency)}</p>
                </div>
              </div>
            </div>
          ))}
          {!orders.length ? <p className="text-sm text-muted-foreground">Aun no tienes pedidos registrados.</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card id="soporte" className="scroll-mt-28">
          <CardHeader>
            <CardTitle>Cotizaciones recibidas</CardTitle>
            <CardDescription>Acepta, rechaza o descarga tus propuestas comerciales.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {client.quotes.map((quote) => (
              <div key={quote.id} className="rounded-lg border bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-display text-xl font-bold">{quote.number}</p>
                    <p className="text-sm text-muted-foreground">{quote.items.map((item) => item.description).join(", ")}</p>
                    <p className="mt-2 text-sm">Asesor: {quote.sellerProfile?.displayName || "Equipo ICC"}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <StatusBadge status={quote.status} />
                    <p className="mt-2 font-display text-2xl font-bold">{formatCurrency(Number(quote.total), quote.currency)}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {quote.publicToken ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/cotizaciones/${quote.publicToken}`}>Ver detalle</Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/api/quotes/${quote.id}/pdf`} target="_blank">
                      Descargar PDF
                    </Link>
                  </Button>
                  {quote.publicToken && ["SENT","VIEWED"].includes(quote.status) ? (
                    <>
                      <form action={respondPublicQuoteFromFormAction.bind(null, quote.publicToken)}>
                        <input type="hidden" name="version" value={quote.updatedAt.toISOString()} />
                        <input type="hidden" name="status" value="ACCEPTED" />
                        <input type="hidden" name="redirectTo" value="/portal?success=quote_accepted" />
                        <SubmitButton size="sm" pendingText="Aceptando...">
                          Aceptar
                        </SubmitButton>
                      </form>
                      <form action={respondPublicQuoteFromFormAction.bind(null, quote.publicToken)}>
                        <input type="hidden" name="version" value={quote.updatedAt.toISOString()} />
                        <input type="hidden" name="status" value="REJECTED" />
                        <input type="hidden" name="redirectTo" value="/portal?success=quote_rejected" />
                        <SubmitButton size="sm" variant="outline" pendingText="Enviando...">
                          Rechazar
                        </SubmitButton>
                      </form>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
            {!client.quotes.length ? <p className="text-sm text-muted-foreground">Aun no tienes cotizaciones registradas.</p> : null}
          </CardContent>
        </Card>

        <Card id="proyectos" className="scroll-mt-28">
          <CardHeader>
            <CardTitle>Nuevo ticket de soporte</CardTitle>
            <CardDescription>Solicita asistencia, calibracion, garantia o revision tecnica.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createCustomerTicketAction} className="grid gap-3">
              <Input name="subject" placeholder="Asunto" required />
              <select name="category" className="h-11 rounded-md border bg-background px-3 text-sm">
                {ticketCategories.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select name="priority" className="h-11 rounded-md border bg-background px-3 text-sm">
                <option value="MEDIUM">Prioridad media</option>
                <option value="LOW">Baja</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
              <Textarea name="description" placeholder="Describe el equipo, servicio, falla o alcance solicitado" required />
              <PortalFileUploader name="attachments" label="Adjuntos" description="Sube fotos del equipo, evidencia o PDF de referencia." />
              <SubmitButton pendingText="Creando ticket...">Crear ticket</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tickets activos</CardTitle>
          <CardDescription>Historial de respuestas entre tu equipo y soporte ICC.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {client.tickets.map((ticket) => (
            <div key={ticket.id} className="rounded-lg border bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-display text-lg font-bold">
                    {ticket.code} - {ticket.subject}
                  </p>
                  <p className="text-sm text-muted-foreground">Responsable: {ticket.assignedProfile?.displayName || "Pendiente de asignacion"}</p>
                </div>
                <StatusBadge status={ticket.status} />
              </div>
              <div className="mt-4 grid gap-2">
                {ticket.messages.map((message) => (
                  <div key={message.id} className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="font-semibold">{message.sender === "staff" ? "ICC" : "Cliente"}</p>
                    <p className="mt-1 text-muted-foreground">{message.body}</p>
                  </div>
                ))}
              </div>
              <form action={replyCustomerTicketAction.bind(null, ticket.id)} className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
                <Input name="body" placeholder="Responder ticket" />
                <SubmitButton variant="outline" pendingText="Enviando...">
                  Enviar
                </SubmitButton>
              </form>
            </div>
          ))}
          {!client.tickets.length ? <p className="text-sm text-muted-foreground">Todavia no tienes tickets.</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="documentos" className="scroll-mt-28">
          <CardHeader>
            <CardTitle>Proyectos contratados</CardTitle>
            <CardDescription>Avances, estado y evidencia tecnica asociada.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {client.projects.map((project) => (
              <div key={project.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-display text-lg font-bold">{project.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {project.location || "Sin ubicacion"} | {project.servicesApplied.join(", ")}
                    </p>
                  </div>
                  <StatusBadge status={project.status} />
                </div>
                {project.progress.length ? (
                  <div className="mt-3 space-y-2">
                    {project.progress.map((entry) => (
                      <p key={entry.id} className="rounded-md bg-muted/50 p-3 text-sm">
                        {entry.title}: {entry.body}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {!client.projects.length ? <p className="text-sm text-muted-foreground">No hay proyectos vinculados todavia.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documentos</CardTitle>
            <CardDescription>Fichas, informes, contratos o entregables compartidos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {client.documents.map((document) => (
              <Link key={document.id} href={document.url} target="_blank" className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50">
                <UserRound className="h-4 w-4 text-primary" />
                <span className="font-medium">{document.title}</span>
              </Link>
            ))}
            {!client.documents.length ? <p className="text-sm text-muted-foreground">No hay documentos compartidos.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: ElementType; label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/12 bg-white/[0.06] p-4">
      <Icon className="h-5 w-5 text-[#24C8EE]" />
      <p className="mt-4 font-display text-3xl font-bold">{value}</p>
      <p className="text-sm text-white/60">{label}</p>
    </div>
  );
}
