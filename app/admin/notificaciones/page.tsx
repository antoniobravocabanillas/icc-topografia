import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { markNotificationReadAction } from "@/lib/server/admin-actions";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NotificationsPage() {
  const session = await requireAdminPage(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  const notifications = await prisma.notification.findMany({
    where: { terraqoWorkspaceId, OR: [{ userId: session.user.id }, { userId: null }] },
    orderBy: { createdAt: "desc" },
    take: 120
  });

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Centro operativo</p>
        <h1 className="font-display text-3xl font-bold">Notificaciones</h1>
        <p className="mt-2 text-muted-foreground">Eventos relevantes de leads, cotizaciones, tickets, chat, comisiones y FAQ.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bandeja</CardTitle>
          <CardDescription>{notifications.filter((item) => !item.readAt).length} sin leer.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {notifications.map((notification) => (
            <div key={notification.id} className="flex flex-col gap-3 rounded-lg border bg-background p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-3">
                <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Bell className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-semibold">{notification.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{notification.body || notification.type}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{notification.createdAt.toLocaleString("es-PE")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {notification.href ? <Button asChild variant="outline" size="sm"><Link href={notification.href}>Abrir</Link></Button> : null}
                {!notification.readAt ? (
                  <form action={markNotificationReadAction.bind(null, notification.id)}>
                    <Button type="submit" size="sm">Marcar leida</Button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
          {!notifications.length ? <p className="text-sm text-muted-foreground">No hay notificaciones registradas.</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}

