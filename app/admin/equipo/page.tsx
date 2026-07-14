import { Role, StaffDepartment } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import {
  createStaffProfileAction,
  deleteStaffProfileAction,
  unlinkStaffAccessAction,
  updateStaffProfileAction,
  upsertStaffAccessAction
} from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

const departments: Array<[StaffDepartment, string]> = [
  ["SALES", "Ventas tecnicas"],
  ["TECHNICAL_SUPPORT", "Soporte tecnico"],
  ["FIELD_ENGINEERING", "Campo e ingenieria"],
  ["RENTAL_SERVICE", "Alquiler y servicio"],
  ["ADMINISTRATION", "Administracion"]
];

const accessRoles: Array<[Role, string]> = [
  ["TECHNICIAN", "Tecnico"],
  ["SALES", "Vendedor"],
  ["EDITOR", "Editor"],
  ["ADMIN", "Admin"],
  ["SUPER_ADMIN", "Super admin"],
  ["COMMERCIAL_ADMIN", "Admin comercial"],
  ["SURVEYOR", "Topografo"],
  ["ENGINEER", "Ingeniero"],
  ["ARCHITECT", "Arquitecto"],
  ["SUPPORT", "Soporte"]
];

const commissionTypes = [
  ["SALE_PERCENTAGE", "Porcentaje sobre venta"],
  ["MARGIN_PERCENTAGE", "Porcentaje sobre margen"],
  ["FIXED_AMOUNT", "Monto fijo"],
  ["CATEGORY_PERCENTAGE", "Diferenciada por categoria"]
] as const;

type StaffTools = {
  whatsappTemplate?: string;
  checklist?: string[];
  nextSteps?: string[];
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminTeamPage() {
  await requireAdminPage(["ADMIN"]);
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  const profiles = await prisma.staffProfile.findMany({
    where: { terraqoWorkspaceId },
    include: { user: true },
    orderBy: [{ active: "desc" }, { department: "asc" }, { displayName: "asc" }]
  });

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Equipo comercial</p>
        <h1 className="font-display text-3xl font-bold">Perfiles de vendedores y tecnicos</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Define perfiles asignables al chat, especialidades y herramientas de trabajo para responder con criterio comercial.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo perfil</CardTitle>
          <CardDescription>Este perfil se podra asignar a conversaciones del chat.</CardDescription>
        </CardHeader>
        <CardContent>
          <StaffProfileForm action={createStaffProfileAction} submitLabel="Crear perfil" />
        </CardContent>
      </Card>

      <div className="grid gap-5">
        {profiles.map((profile) => {
          const tools = profile.tools as StaffTools;
          return (
            <Card key={profile.id}>
              <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle>{profile.displayName}</CardTitle>
                  <CardDescription>{profile.roleTitle} | {departmentLabel(profile.department)}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={profile.active ? "accent" : "outline"}>{profile.active ? "Activo" : "Inactivo"}</Badge>
                  {profile.specialties.slice(0, 4).map((specialty) => <Badge key={specialty} variant="outline">{specialty}</Badge>)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <StaffProfileForm
                  action={updateStaffProfileAction.bind(null, profile.id)}
                  submitLabel="Guardar cambios"
                  defaults={{
                    displayName: profile.displayName,
                    email: profile.email || "",
                    phone: profile.phone || "",
                    roleTitle: profile.roleTitle,
                    department: profile.department,
                    avatar: profile.avatar || "",
                    commissionType: profile.commissionType,
                    commissionRate: String(profile.commissionRate),
                    fixedCommission: String(profile.fixedCommission),
                    monthlyGoal: String(profile.monthlyGoal),
                    territory: profile.territory || "",
                    internalNotes: profile.internalNotes || "",
                    specialties: profile.specialties.join("\n"),
                    whatsappTemplate: tools.whatsappTemplate || "",
                    checklist: tools.checklist?.join("\n") || "",
                    nextSteps: tools.nextSteps?.join("\n") || "",
                    active: profile.active
                  }}
                />
                <AccessForm
                  profileId={profile.id}
                  user={profile.user}
                  defaultEmail={profile.user?.email || profile.email || ""}
                  defaultRole={(profile.user?.role as Role | undefined) || (profile.department === "TECHNICAL_SUPPORT" ? "TECHNICIAN" : "SALES")}
                />
                <form action={deleteStaffProfileAction.bind(null, profile.id)}>
                  <Button type="submit" variant="destructive">Eliminar perfil</Button>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function AccessForm({
  profileId,
  user,
  defaultEmail,
  defaultRole
}: {
  profileId: string;
  user: { email: string; role: Role } | null;
  defaultEmail: string;
  defaultRole: Role;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-3 flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <div>
          <h3 className="font-semibold">Acceso al panel</h3>
          <p className="text-sm text-muted-foreground">
            {user ? `Usuario vinculado: ${user.email} | Rol ${roleLabel(user.role)}` : "Sin usuario vinculado. Crea un acceso con contrasena temporal."}
          </p>
        </div>
        {user ? (
          <form action={unlinkStaffAccessAction.bind(null, profileId)}>
            <Button type="submit" variant="outline">Desvincular</Button>
          </form>
        ) : null}
      </div>
      <form action={upsertStaffAccessAction.bind(null, profileId)} className="grid gap-3 md:grid-cols-[1fr_180px_1fr_auto]">
        <Input name="accessEmail" type="email" placeholder="Correo de acceso" defaultValue={defaultEmail} required />
        <select name="role" defaultValue={defaultRole} className="h-11 rounded-md border bg-background px-3 text-sm">
          {accessRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Input name="temporaryPassword" type="text" placeholder={user ? "Nueva contrasena temporal opcional" : "Contrasena temporal"} required={!user} />
        <Button type="submit">{user ? "Actualizar acceso" : "Crear acceso"}</Button>
      </form>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        El usuario entra por /cuenta. Si es vendedor o tecnico, solo vera su panel operativo y los chats asignados a su perfil.
      </p>
    </div>
  );
}

function StaffProfileForm({
  action,
  submitLabel,
  defaults
}: {
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  defaults?: {
    displayName: string;
    email: string;
    phone: string;
    roleTitle: string;
    department: StaffDepartment;
    avatar: string;
    commissionType: string;
    commissionRate: string;
    fixedCommission: string;
    monthlyGoal: string;
    territory: string;
    internalNotes: string;
    specialties: string;
    whatsappTemplate: string;
    checklist: string;
    nextSteps: string;
    active: boolean;
  };
}) {
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <Input name="displayName" placeholder="Nombre visible" defaultValue={defaults?.displayName} required />
      <Input name="roleTitle" placeholder="Cargo o perfil comercial" defaultValue={defaults?.roleTitle} required />
      <Input name="email" type="email" placeholder="Correo" defaultValue={defaults?.email} />
      <Input name="phone" placeholder="Telefono / WhatsApp" defaultValue={defaults?.phone} />
      <Input name="avatar" placeholder="URL de foto/avatar" defaultValue={defaults?.avatar} />
      <Input name="territory" placeholder="Zona o cartera asignada" defaultValue={defaults?.territory} />
      <select name="department" defaultValue={defaults?.department || "SALES"} className="h-11 rounded-md border bg-background px-3 text-sm">
        {departments.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select name="commissionType" defaultValue={defaults?.commissionType || "SALE_PERCENTAGE"} className="h-11 rounded-md border bg-background px-3 text-sm">
        {commissionTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <Input name="commissionRate" type="number" step="0.01" placeholder="% comision" defaultValue={defaults?.commissionRate || "5"} />
      <Input name="fixedCommission" type="number" step="0.01" placeholder="Comision fija" defaultValue={defaults?.fixedCommission || "0"} />
      <Input name="monthlyGoal" type="number" step="0.01" placeholder="Meta mensual" defaultValue={defaults?.monthlyGoal || "0"} />
      <label className="flex items-center gap-2 rounded-md border bg-background px-3 text-sm">
        <input type="checkbox" name="active" defaultChecked={defaults?.active ?? true} />
        Activo para asignacion
      </label>
      <Textarea name="specialties" placeholder="Especialidades, una por linea" defaultValue={defaults?.specialties} />
      <Textarea name="checklist" placeholder="Checklist interno, una accion por linea" defaultValue={defaults?.checklist} />
      <Textarea name="nextSteps" placeholder="Siguientes pasos comerciales, uno por linea" defaultValue={defaults?.nextSteps} />
      <Textarea name="whatsappTemplate" placeholder="Plantilla sugerida de WhatsApp o email" defaultValue={defaults?.whatsappTemplate} />
      <Textarea name="internalNotes" placeholder="Observaciones internas del perfil" defaultValue={defaults?.internalNotes} />
      <div className="md:col-span-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

function departmentLabel(department: StaffDepartment) {
  return departments.find(([value]) => value === department)?.[1] || department;
}

function roleLabel(role: Role) {
  return accessRoles.find(([value]) => value === role)?.[1] || role;
}
