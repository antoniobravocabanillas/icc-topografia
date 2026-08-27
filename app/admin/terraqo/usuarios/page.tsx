import bcrypt from "bcryptjs";
import type { Role, TerraqoMemberRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";

const globalRoles: Role[] = ["CUSTOMER", "TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"];
const memberRoles: TerraqoMemberRole[] = ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER", "CLIENT", "PROFESSIONAL"];

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

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ status?: string }> };

export default async function TerraqoUsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  await requireAdminPage(["SUPER_ADMIN"]);
  const [users, workspaces, totals] = await Promise.all([
    prisma.user.findMany({
      include: {
        terraqoMemberships: { include: { workspace: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: "asc" } },
        terraqoProfessionalProfile: { select: { id: true, headline: true, identityVerificationStatus: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 250
    }),
    prisma.terraqoWorkspace.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
    Promise.all([
      prisma.user.count(),
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[[totals[0], "Usuarios"], [totals[1], "Superadministradores"], [totals[2], "Perfiles profesionales"], [totals[3], "Membresias activas"]].map(([value, label]) => (
          <Card key={String(label)}><CardHeader><CardTitle className="text-3xl">{value}</CardTitle><CardDescription>{label}</CardDescription></CardHeader></Card>
        ))}
      </div>

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
                <div className="flex flex-wrap items-center gap-2"><CardTitle>{user.name || "Sin nombre"}</CardTitle><Badge variant={user.role === "SUPER_ADMIN" ? "default" : "secondary"}>{user.role}</Badge></div>
                <CardDescription className="mt-2">{user.email} | creado {user.createdAt.toLocaleDateString("es-PE")}</CardDescription>
                {user.terraqoProfessionalProfile ? <p className="mt-2 text-sm text-muted-foreground">Profesional: {user.terraqoProfessionalProfile.headline || "Perfil por completar"} | {user.terraqoProfessionalProfile.identityVerificationStatus}</p> : null}
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
