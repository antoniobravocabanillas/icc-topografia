import bcrypt from "bcryptjs";
import type { Role, TerraqoMemberRole, TerraqoPlanTier } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { createEmailVerificationLinkToken } from "@/lib/server/email-verification";
import { sendTransactionalEmail } from "@/lib/server/transactional-email";
import { renderProfileCompletionEmail } from "@/emails/terraqo-transactional";
import { terraqoDomains } from "@/lib/terraqo-domains";

const globalRoles: Role[] = ["CUSTOMER", "TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"];
const memberRoles: TerraqoMemberRole[] = ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER", "CLIENT", "PROFESSIONAL"];
const planTiers: TerraqoPlanTier[] = ["FREE", "BASIC", "PROFESSIONAL", "PREMIUM", "ENTERPRISE"];

function field(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

async function createUserAction(formData: FormData) {
  "use server";
  await requireAdminPage(["SUPER_ADMIN"]);
  const email = field(formData, "email").toLowerCase();
  const name = field(formData, "name");
  const password = field(formData, "password");
  const role = field(formData, "role") as Role;
  if (!email || !name || password.length < 12 || !globalRoles.includes(role)) throw new Error("Completa nombre, correo, rol y una clave de al menos 12 caracteres.");
  await prisma.user.create({ data: { email, name, role, passwordHash: await bcrypt.hash(password, 12) } });
  revalidatePath("/admin/terraqo/usuarios");
}

async function updateUserAction(formData: FormData) {
  "use server";
  const session = await requireAdminPage(["SUPER_ADMIN"]);
  const userId = field(formData, "userId");
  const role = field(formData, "role") as Role;
  const name = field(formData, "name");
  if (!userId || !globalRoles.includes(role)) return;
  if (userId === session.user.id && role !== "SUPER_ADMIN") throw new Error("No puedes retirar tu propio acceso de superadministrador.");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (target?.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
    const superAdmins = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
    if (superAdmins <= 1) throw new Error("Terraqo debe conservar al menos un superadministrador.");
  }
  await prisma.user.update({ where: { id: userId }, data: { role, ...(name ? { name } : {}) } });
  revalidatePath("/admin/terraqo/usuarios");
}

async function resetPasswordAction(formData: FormData) {
  "use server";
  await requireAdminPage(["SUPER_ADMIN"]);
  const userId = field(formData, "userId");
  const password = field(formData, "password");
  if (!userId || password.length < 12) throw new Error("La nueva clave debe tener al menos 12 caracteres.");
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  revalidatePath("/admin/terraqo/usuarios");
}

async function upsertMembershipAction(formData: FormData) {
  "use server";
  await requireAdminPage(["SUPER_ADMIN"]);
  const userId = field(formData, "userId");
  const workspaceId = field(formData, "workspaceId");
  const role = field(formData, "memberRole") as TerraqoMemberRole;
  if (!userId || !workspaceId || !memberRoles.includes(role)) return;
  await prisma.$transaction(async (tx) => {
    await tx.terraqoWorkspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      update: { role, active: true, joinedAt: new Date() },
      create: { workspaceId, userId, role, active: true, invitedAt: new Date(), joinedAt: new Date() }
    });
    if (role !== "PROFESSIONAL") return;
    const [profile, workspace] = await Promise.all([
      tx.terraqoProfessionalProfile.findUnique({ where: { userId }, select: { id: true, headline: true } }),
      tx.terraqoWorkspace.findUnique({ where: { id: workspaceId }, select: { name: true, brandName: true, companyId: true } })
    ]);
    if (!profile || !workspace) return;
    await tx.terraqoProfessionalAffiliation.upsert({
      where: { professionalProfileId_workspaceId: { professionalProfileId: profile.id, workspaceId } },
      update: {
        companyId: workspace.companyId,
        companyName: workspace.brandName || workspace.name,
        roleTitle: profile.headline,
        current: true,
        verificationStatus: "VERIFIED",
        visibility: "WORKSPACE",
        endedAt: null
      },
      create: {
        professionalProfileId: profile.id,
        workspaceId,
        companyId: workspace.companyId,
        companyName: workspace.brandName || workspace.name,
        roleTitle: profile.headline,
        current: true,
        verificationStatus: "VERIFIED",
        visibility: "WORKSPACE",
        startedAt: new Date()
      }
    });
  });
  revalidatePath("/admin/terraqo/usuarios");
  revalidatePath("/portal/perfil");
  redirect("/admin/terraqo/usuarios?status=workspace-assigned");
}

async function updateMembershipAction(formData: FormData) {
  "use server";
  await requireAdminPage(["SUPER_ADMIN"]);
  const membershipId = field(formData, "membershipId");
  const role = field(formData, "memberRole") as TerraqoMemberRole;
  const active = field(formData, "active") === "true";
  if (!membershipId || !memberRoles.includes(role)) return;
  await prisma.terraqoWorkspaceMember.update({ where: { id: membershipId }, data: { role, active } });
  revalidatePath("/admin/terraqo/usuarios");
}

async function updateProfessionalPlanAction(formData: FormData) {
  "use server";
  await requireAdminPage(["SUPER_ADMIN"]);
  const profileId = field(formData, "profileId");
  const planTier = field(formData, "planTier") as TerraqoPlanTier;
  if (!profileId || !planTiers.includes(planTier)) return;
  await prisma.terraqoProfessionalProfile.update({ where: { id: profileId }, data: { planTier } });
  revalidatePath("/admin/terraqo/usuarios");
  revalidatePath("/portal");
}

async function sendProfileNudgeAction(formData: FormData) {
  "use server";
  await requireAdminPage(["SUPER_ADMIN"]);
  const userId = field(formData, "userId");
  const verificationFilter = field(formData, "verificationFilter");
  const query = field(formData, "query").trim();
  const customMessage = field(formData, "customMessage").slice(0, 1200);
  const where = userId
    ? { id: userId, terraqoProfessionalProfile: { isNot: null } }
    : {
        terraqoProfessionalProfile: { isNot: null },
        ...(verificationFilter === "verified" ? { emailVerified: { not: null } } : verificationFilter === "unverified" ? { emailVerified: null } : {}),
        ...(query ? { OR: [{ email: { contains: query, mode: "insensitive" as const } }, { name: { contains: query, mode: "insensitive" as const } }] } : {})
      };
  const recipients = await prisma.user.findMany({
    where,
    select: { id: true, email: true, name: true, emailVerified: true, terraqoProfessionalProfile: { select: { username: true, onboardingSource: true } } },
    orderBy: { createdAt: "desc" },
    take: userId ? 1 : 100
  });
  const sourceSlugs = [...new Set(recipients.map((recipient) => recipient.terraqoProfessionalProfile?.onboardingSource?.match(/^public-careers:(.+)$/)?.[1]).filter((value): value is string => Boolean(value)))];
  const sourceWorkspaces = sourceSlugs.length
    ? await prisma.terraqoWorkspace.findMany({ where: { slug: { in: sourceSlugs } }, select: { slug: true, name: true, brandName: true } })
    : [];
  const sourceNames = new Map(sourceWorkspaces.map((workspace) => [workspace.slug, workspace.brandName || workspace.name]));

  let delivered = 0;
  for (const recipient of recipients) {
    const sourceSlug = recipient.terraqoProfessionalProfile?.onboardingSource?.match(/^public-careers:(.+)$/)?.[1];
    const registrationSourceName = sourceSlug ? sourceNames.get(sourceSlug) || sourceSlug : null;
    let actionUrl = `${terraqoDomains.portal}/portal/configuracion`;
    if (!recipient.emailVerified) {
      const verification = await createEmailVerificationLinkToken(prisma, recipient.email);
      actionUrl = `${terraqoDomains.portal}/api/auth/verify-email-link?token=${encodeURIComponent(verification.code)}&email=${encodeURIComponent(recipient.email)}`;
    }
    const content = await renderProfileCompletionEmail({ recipientName: recipient.name, profileUrl: actionUrl, customMessage, emailVerified: Boolean(recipient.emailVerified), hasUsername: Boolean(recipient.terraqoProfessionalProfile?.username), registrationSourceName });
    const result = await sendTransactionalEmail({ to: recipient.email, subject: "Completa tu perfil y aumenta tus oportunidades en Terraqo", ...content, tags: [{ name: "category", value: "profile-completion" }] });
    if (result.delivered) delivered += 1;
  }
  revalidatePath("/admin/terraqo/usuarios");
  redirect(`/admin/terraqo/usuarios?status=emails-sent&sent=${delivered}`);
}

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ status?: string; sent?: string; verification?: string; q?: string }> };

export default async function TerraqoUsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  await requireAdminPage(["SUPER_ADMIN"]);
  const verification = params?.verification || "all";
  const q = params?.q?.trim() || "";
  const userWhere = {
    ...(verification === "verified" ? { emailVerified: { not: null } } : verification === "unverified" ? { emailVerified: null } : {}),
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] } : {})
  };
  const [users, workspaces, totals] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      include: {
        terraqoMemberships: { include: { workspace: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: "asc" } },
        terraqoProfessionalProfile: { select: { id: true, headline: true, username: true, identityVerificationStatus: true, planTier: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 250
    }),
    prisma.terraqoWorkspace.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
    Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: { not: null } } }),
      prisma.user.count({ where: { emailVerified: null } }),
      prisma.user.count({ where: { role: "SUPER_ADMIN" } }),
      prisma.terraqoProfessionalProfile.count(),
      prisma.terraqoWorkspaceMember.count({ where: { active: true } })
    ])
  ]);

  return (
    <section className="space-y-8">
      <header className="max-w-4xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Gobierno de plataforma</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Usuarios, perfiles y accesos</h1>
        <p className="mt-3 text-muted-foreground">Control global de identidades Terraqo. El rol global define la superficie disponible y la membresia limita cada usuario a los datos de su workspace.</p>
      </header>

      {params?.status === "workspace-assigned" ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Workspace asignado correctamente. Si el usuario es profesional, su vínculo empresarial también quedó validado.</div> : null}
      {params?.status === "emails-sent" ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Se enviaron {params.sent || "0"} correos de acompañamiento.</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[[totals[0], "Usuarios"], [totals[1], "Correos verificados"], [totals[2], "Correos pendientes"], [totals[4], "Perfiles profesionales"]].map(([value, label]) => (
          <Card key={String(label)}><CardHeader><CardTitle className="text-3xl">{value}</CardTitle><CardDescription>{label}</CardDescription></CardHeader></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Seguimiento de activación y empleabilidad</CardTitle><CardDescription>Filtra usuarios y envía una invitación personalizada para verificar el correo, crear su nombre de usuario, completar el perfil y registrar bitácoras.</CardDescription></CardHeader>
        <CardContent className="grid gap-5">
          <form method="get" className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <Input name="q" defaultValue={q} placeholder="Buscar por nombre o correo" />
            <select name="verification" defaultValue={verification} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">Todos los correos</option><option value="verified">Verificados</option><option value="unverified">No verificados</option></select>
            <Button type="submit" variant="outline">Aplicar filtros</Button>
          </form>
          <form action={sendProfileNudgeAction} className="grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <input type="hidden" name="verificationFilter" value={verification} />
            <input type="hidden" name="query" value={q} />
            <label className="grid gap-2 text-sm font-semibold">Mensaje personalizado <Textarea name="customMessage" maxLength={1200} placeholder="Ej. Queremos ayudarte a fortalecer tu presencia profesional y mostrar mejor tu experiencia." className="min-h-24 bg-white font-normal" /></label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-muted-foreground">Se enviará a un máximo de 100 profesionales según el filtro de verificación seleccionado. Los pendientes recibirán un enlace nuevo de verificación.</p><Button type="submit">Enviar a los usuarios filtrados</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Crear acceso</CardTitle><CardDescription>Alta manual para administradores, equipo Terraqo o cuentas asistidas.</CardDescription></CardHeader>
        <CardContent>
          <form action={createUserAction} className="grid gap-3 lg:grid-cols-[1fr_1fr_220px_1fr_auto]">
            <Input name="name" placeholder="Nombre completo" required />
            <Input name="email" type="email" placeholder="correo@dominio.com" required />
            <select name="role" defaultValue="CUSTOMER" className="h-10 rounded-md border bg-background px-3 text-sm">{globalRoles.map((role) => <option key={role}>{role}</option>)}</select>
            <Input name="password" type="password" minLength={12} placeholder="Clave temporal (12+ caracteres)" required />
            <Button type="submit">Crear usuario</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {users.map((user) => (
          <Card key={user.id}>
            <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><CardTitle>{user.name || "Sin nombre"}</CardTitle><Badge variant={user.role === "SUPER_ADMIN" ? "default" : "secondary"}>{user.role}</Badge><Badge variant={user.emailVerified ? "default" : "outline"}>{user.emailVerified ? "Correo verificado" : "Correo pendiente"}</Badge></div>
                <CardDescription className="mt-2">{user.email} | creado {user.createdAt.toLocaleDateString("es-PE")}</CardDescription>
                {user.terraqoProfessionalProfile ? <p className="mt-2 text-sm text-muted-foreground">Profesional: {user.terraqoProfessionalProfile.headline || "Perfil por completar"} | {user.terraqoProfessionalProfile.identityVerificationStatus} | Plan {user.terraqoProfessionalProfile.planTier}</p> : null}
              </div>
              <form action={updateUserAction} className="grid gap-2 sm:grid-cols-[220px_200px_auto]">
                <input type="hidden" name="userId" value={user.id} />
                <Input name="name" defaultValue={user.name || ""} aria-label="Nombre" />
                <select name="role" defaultValue={user.role} className="h-10 rounded-md border bg-background px-3 text-sm">{globalRoles.map((role) => <option key={role}>{role}</option>)}</select>
                <Button type="submit" variant="outline">Guardar identidad</Button>
              </form>
            </CardHeader>
            <CardContent className="grid gap-5 xl:grid-cols-[1fr_380px]">
              <div>
                {user.terraqoProfessionalProfile ? (
                  <><div className="mb-4 grid gap-3 rounded-xl border bg-[#0e1a26] p-4 text-white sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#25c0d5]">Vista previa del CV público</p><p className="mt-2 font-display text-lg font-bold">{user.name || "Nombre profesional"}</p><p className="mt-1 text-sm text-white/70">{user.terraqoProfessionalProfile.headline || "Título profesional por completar"}</p><p className="mt-2 text-xs text-white/50">{user.terraqoProfessionalProfile.username ? `terraqoglobal.com/cv/${user.terraqoProfessionalProfile.username}` : "Aún no creó su nombre de usuario"}</p></div>{user.terraqoProfessionalProfile.username ? <Button asChild variant="outline" className="border-white/30 bg-transparent text-white"><a href={`${terraqoDomains.public}/cv/${user.terraqoProfessionalProfile.username}`} target="_blank">Ver perfil</a></Button> : null}</div><form action={sendProfileNudgeAction} className="mb-4 flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-end"><input type="hidden" name="userId" value={user.id} /><label className="grid flex-1 gap-1 text-xs font-bold">Mensaje personalizado<Input name="customMessage" placeholder="Mensaje opcional para este usuario" className="font-normal" /></label><Button type="submit" variant="outline">Enviar invitación</Button></form><form action={updateProfessionalPlanAction} className="mb-5 grid gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 sm:grid-cols-[1fr_180px_auto] sm:items-center">
                    <input type="hidden" name="profileId" value={user.terraqoProfessionalProfile.id} />
                    <div><p className="font-semibold">Plan profesional Terraqo</p><p className="text-xs text-muted-foreground">Pertenece al perfil personal y no al workspace de una empresa.</p></div>
                    <select name="planTier" defaultValue={user.terraqoProfessionalProfile.planTier} className="h-10 rounded-md border bg-background px-3 text-sm">{planTiers.map((tier) => <option key={tier}>{tier}</option>)}</select>
                    <Button type="submit" variant="outline">Actualizar plan</Button>
                  </form></>
                ) : null}
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Membresias</p>
                <div className="space-y-2">
                  {user.terraqoMemberships.map((membership) => (
                    <form key={membership.id} action={updateMembershipAction} className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-[1fr_180px_130px_auto] sm:items-center">
                      <input type="hidden" name="membershipId" value={membership.id} />
                      <div><p className="font-semibold">{membership.workspace.name}</p><p className="text-xs text-muted-foreground">{membership.workspace.slug}</p></div>
                      <select name="memberRole" defaultValue={membership.role} className="h-10 rounded-md border bg-background px-3 text-sm">{memberRoles.map((role) => <option key={role}>{role}</option>)}</select>
                      <select name="active" defaultValue={String(membership.active)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="true">Activa</option><option value="false">Suspendida</option></select>
                      <Button type="submit" variant="outline">Actualizar</Button>
                    </form>
                  ))}
                  {!user.terraqoMemberships.length ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Sin workspace asignado.</p> : null}
                </div>
                <form action={upsertMembershipAction} className="mt-3 grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_180px_auto]">
                  <input type="hidden" name="userId" value={user.id} />
                  <select name="workspaceId" className="h-10 rounded-md border bg-background px-3 text-sm">{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
                  <select name="memberRole" defaultValue="MEMBER" className="h-10 rounded-md border bg-background px-3 text-sm">{memberRoles.map((role) => <option key={role}>{role}</option>)}</select>
                  <Button type="submit">Asignar workspace</Button>
                </form>
              </div>
              <form action={resetPasswordAction} className="self-start rounded-md border bg-muted/20 p-4">
                <input type="hidden" name="userId" value={user.id} />
                <p className="font-semibold">Restablecer acceso</p>
                <p className="mt-1 text-xs text-muted-foreground">La clave se cifra antes de guardarse y nunca vuelve a mostrarse.</p>
                <Input name="password" type="password" minLength={12} placeholder="Nueva clave temporal" className="mt-4" required />
                <Button type="submit" variant="outline" className="mt-3 w-full">Cambiar contrasena</Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
