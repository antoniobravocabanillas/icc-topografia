import { revalidatePath } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/server/api";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getDefaultTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function tags(formData: FormData) {
  return (field(formData, "tags") || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function createForumChannelAction(formData: FormData) {
  "use server";

  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getDefaultTerraqoWorkspaceId();
  if (!workspaceId) throw new Error("Workspace Terraqo no configurado.");
  await requireWorkspaceModule("FORUMS", workspaceId);

  const name = field(formData, "name") || "";
  if (!name) return;

  await prisma.terraqoForumChannel.upsert({
    where: { slug: field(formData, "slug") || slugify(name) },
    update: {
      name,
      description: field(formData, "description"),
      workspaceId,
      active: true
    },
    create: {
      workspaceId,
      name,
      slug: field(formData, "slug") || slugify(name),
      description: field(formData, "description"),
      visibility: "COMMUNITY",
      active: true
    }
  });

  revalidatePath("/admin/terraqo/comunidad");
}

async function createForumPostAction(formData: FormData) {
  "use server";

  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getDefaultTerraqoWorkspaceId();
  if (!workspaceId) throw new Error("Workspace Terraqo no configurado.");
  await requireWorkspaceModule("FORUMS", workspaceId);
  const session = await auth();

  const channelId = field(formData, "channelId");
  const title = field(formData, "title") || "";
  const body = field(formData, "body") || "";
  if (!channelId || !title || !body) return;

  await prisma.terraqoForumPost.create({
    data: {
      channelId,
      authorId: session?.user?.id,
      title,
      body,
      tags: tags(formData),
      visibility: "COMMUNITY",
      pinned: formData.get("pinned") === "on"
    }
  });

  revalidatePath("/admin/terraqo/comunidad");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TerraqoCommunityPage() {
  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getDefaultTerraqoWorkspaceId();
  if (!workspaceId) throw new Error("Workspace Terraqo no configurado.");
  await requireWorkspaceModule("FORUMS", workspaceId);

  const [channels, posts] = await Promise.all([
    prisma.terraqoForumChannel.findMany({
      where: { workspaceId, active: true },
      include: { _count: { select: { posts: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.terraqoForumPost.findMany({
      where: { channel: { workspaceId }, deletedAt: null },
      include: { channel: true, author: true, _count: { select: { replies: true } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 60
    })
  ]);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase text-primary">Terraqo comunidad</p>
        <h1 className="font-display text-3xl font-bold">Foros, conocimiento y conversacion profesional</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Base para comunidad tipo LinkedIn: canales por industria, preguntas tecnicas, publicaciones fijadas,
          debates privados por workspace y conversacion profesional activable por suscripcion.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Metric title={channels.length} label="Canales activos" />
        <Metric title={posts.length} label="Publicaciones recientes" />
        <Metric title={posts.reduce((total, post) => total + post._count.replies, 0)} label="Respuestas registradas" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Crear canal</CardTitle>
            <CardDescription>Organiza conversaciones por rubro, tecnologia, mercado o comunidad.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createForumChannelAction} className="grid gap-3">
              <Input name="name" placeholder="Nombre del canal" required />
              <Input name="slug" placeholder="slug opcional" />
              <Textarea name="description" placeholder="Descripcion del canal" />
              <Button type="submit">Crear canal</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nueva publicacion</CardTitle>
            <CardDescription>Publica contenido inicial para activar conversacion y conocimiento.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createForumPostAction} className="grid gap-3">
              <select name="channelId" className="h-11 rounded-md border bg-background px-3 text-sm" required>
                <option value="">Selecciona canal</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>{channel.name}</option>
                ))}
              </select>
              <Input name="title" placeholder="Titulo" required />
              <Textarea name="body" placeholder="Contenido" required />
              <Textarea name="tags" placeholder="Etiquetas separadas por coma o salto de linea" />
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="pinned" className="h-4 w-4" />
                Fijar publicacion
              </label>
              <Button type="submit">Publicar</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Canales</CardTitle>
            <CardDescription>Espacios activos de la comunidad.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {channels.map((channel) => (
              <div key={channel.id} className="rounded-md border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{channel.name}</p>
                  <Badge variant="outline">{channel._count.posts}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{channel.description || "Sin descripcion"}</p>
              </div>
            ))}
            {!channels.length ? <p className="text-sm text-muted-foreground">Aun no hay canales creados.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Publicaciones recientes</CardTitle>
            <CardDescription>Contenido visible para la comunidad del workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {posts.map((post) => (
              <div key={post.id} className="rounded-md border p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{post.title}</p>
                      {post.pinned ? <Badge>Fijado</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{post.channel.name} | {post.author?.name || post.author?.email || "Equipo Terraqo"}</p>
                    <p className="mt-3 line-clamp-2 text-sm leading-6">{post.body}</p>
                  </div>
                  <Badge variant="outline">{post._count.replies} respuestas</Badge>
                </div>
              </div>
            ))}
            {!posts.length ? <p className="text-sm text-muted-foreground">Aun no hay publicaciones.</p> : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Metric({ title, label }: { title: number; label: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">{title}</CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
    </Card>
  );
}
