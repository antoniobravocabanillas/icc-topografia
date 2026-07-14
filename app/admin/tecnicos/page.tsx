import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { updateTechnicalProfileAction } from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

const departments = ["FIELD_ENGINEERING", "TECHNICAL_SUPPORT", "RENTAL_SERVICE", "ADMINISTRATION"];
const availability = ["AVAILABLE", "FIELD", "BUSY", "OFFLINE"];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminTechnicalProfilesPage() {
  await requireAdminPage(["ADMIN", "SUPER_ADMIN", "ENGINEER", "SURVEYOR", "ARCHITECT", "SUPPORT"]);
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  const profiles = await prisma.staffProfile.findMany({
    where: { terraqoWorkspaceId, department: { in: ["FIELD_ENGINEERING", "TECHNICAL_SUPPORT", "RENTAL_SERVICE"] } },
    include: {
      projectMembers: { include: { project: true } },
      ticketAssignee: { where: { status: { notIn: ["RESOLVED", "CLOSED"] } } }
    },
    orderBy: { displayName: "asc" }
  });

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Operacion tecnica</p>
        <h1 className="font-display text-3xl font-bold">Perfiles tecnicos</h1>
        <p className="mt-2 text-muted-foreground">Topografos, ingenieros, arquitectos y soporte con disponibilidad, asignaciones y documentos.</p>
      </div>

      <div className="grid gap-5">
        {profiles.map((profile) => (
          <Card key={profile.id}>
            <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>{profile.displayName}</CardTitle>
                <CardDescription>{profile.roleTitle} | {profile.email || "Sin correo"} | {profile.phone || "Sin telefono"}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={profile.availability} />
                {profile.active ? <StatusBadge status="AVAILABLE" /> : <StatusBadge status="OFFLINE" />}
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <form action={updateTechnicalProfileAction.bind(null, profile.id)} className="grid gap-3 md:grid-cols-2">
                <Input name="roleTitle" defaultValue={profile.roleTitle} placeholder="Cargo tecnico" />
                <Input name="phone" defaultValue={profile.phone || ""} placeholder="Telefono" />
                <select name="department" defaultValue={profile.department} className="h-11 rounded-md border bg-background px-3 text-sm">
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
                <select name="availability" defaultValue={profile.availability} className="h-11 rounded-md border bg-background px-3 text-sm">
                  {availability.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <Input name="workZone" defaultValue={profile.workZone || ""} placeholder="Zona de trabajo" />
                <Input name="experience" defaultValue={profile.experience || ""} placeholder="Experiencia / seniority" />
                <Textarea name="specialties" defaultValue={profile.specialties.join("\n")} placeholder="Especialidades, una por linea" />
                <Textarea name="certifications" defaultValue={profile.certifications.join("\n")} placeholder="Certificaciones, una por linea" />
                <Textarea name="documents" defaultValue={profile.documents.join("\n")} placeholder="Documentos adjuntos, una URL por linea" />
                <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-3 text-sm">
                  <input type="checkbox" name="active" defaultChecked={profile.active} />
                  Perfil activo
                </label>
                <Button type="submit" className="md:col-span-2">Guardar perfil tecnico</Button>
              </form>

              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="font-semibold">Asignaciones activas</p>
                  <div className="mt-3 space-y-2 text-sm">
                    {profile.projectMembers.map((member) => (
                      <p key={member.id} className="rounded-md bg-background p-3">
                        {member.project.title} <span className="text-muted-foreground">({member.role})</span>
                      </p>
                    ))}
                    {!profile.projectMembers.length ? <p className="text-muted-foreground">Sin proyectos asignados.</p> : null}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="font-semibold">Tickets asignados</p>
                  <p className="mt-2 font-display text-3xl font-bold">{profile.ticketAssignee.length}</p>
                  <p className="text-sm text-muted-foreground">Casos abiertos o en proceso.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!profiles.length ? <p className="text-sm text-muted-foreground">No hay perfiles tecnicos registrados.</p> : null}
      </div>
    </section>
  );
}

