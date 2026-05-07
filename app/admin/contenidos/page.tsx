import type { ReactNode } from "react";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { ClientLogoUploader } from "@/components/admin/client-logo-uploader";
import { FormSubmitButton } from "@/components/admin/form-submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import {
  createBannerAction,
  createClientLogoAction,
  createCmsPageAction,
  createFaqAction,
  createPostAction,
  createServiceAction,
  createTestimonialAction,
  deleteBannerAction,
  deleteClientLogoAction,
  deleteCmsPageAction,
  deleteFaqAction,
  deletePostAction,
  deleteServiceAction,
  deleteTestimonialAction,
  updateBannerAction,
  updateClientLogoAction,
  updateCmsPageAction,
  updateFaqAction,
  updatePostAction,
  updateServiceAction,
  updateTestimonialAction
} from "@/lib/server/admin-actions";

type AdminContentPageProps = {
  searchParams?: Promise<{
    blogStatus?: string;
    item?: string;
  }>;
};

const blogStatusMessages: Record<string, string> = {
  created: "Post creado y publicado correctamente.",
  updated: "Cambios del blog guardados correctamente.",
  deleted: "Post eliminado correctamente."
};

export default async function AdminContentPage({ searchParams }: AdminContentPageProps) {
  await requireAdminPage(["EDITOR", "ADMIN"]);
  const resolvedSearchParams = await searchParams;
  const blogStatus = resolvedSearchParams?.blogStatus;
  const blogStatusMessage = blogStatus ? blogStatusMessages[blogStatus] : null;
  const [services, posts, faqs, testimonials, clientLogos, banners, pages] = await Promise.all([
    prisma.service.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.blogPost.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.faq.findMany({ orderBy: [{ position: "asc" }, { createdAt: "desc" }] }),
    prisma.testimonial.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.clientLogo.findMany({ orderBy: [{ position: "asc" }, { createdAt: "desc" }] }),
    prisma.banner.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.cmsPage.findMany({ orderBy: { updatedAt: "desc" } })
  ]);

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Contenidos CMS</h1>
        <p className="mt-2 text-muted-foreground">Gestiona lo que publica el front: servicios, blog, FAQ, logos de clientes, testimonios, banners y paginas.</p>
      </div>

      {blogStatusMessage ? (
        <div className="flex items-start gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">{blogStatusMessage}</p>
            {resolvedSearchParams?.item ? <p className="mt-1 text-emerald-800">{resolvedSearchParams.item}</p> : null}
          </div>
        </div>
      ) : null}

      <CmsBlock title="Servicios" description="Aparecen en /servicios, fichas individuales y home." createAction={createServiceAction} fields={["title", "slug", "summary", "content"]}>
        {services.map((service) => (
          <EditableRow key={service.id} title={service.title} subtitle={service.slug} updateAction={updateServiceAction.bind(null, service.id)} deleteAction={deleteServiceAction.bind(null, service.id)}>
            <Input name="title" defaultValue={service.title} />
            <Input name="slug" defaultValue={service.slug} />
            <Textarea name="summary" defaultValue={service.summary} />
            <Textarea name="content" defaultValue={JSON.stringify(service.content, null, 2)} />
            <label className="flex gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked={service.isPublished} /> Publicado</label>
          </EditableRow>
        ))}
      </CmsBlock>

      <CmsBlock title="Blog" description="Posts publicados en /blog." createAction={createPostAction} fields={["title", "slug", "excerpt", "content", "category", "author"]}>
        {posts.map((post) => (
          <EditableRow key={post.id} title={post.title} subtitle={post.slug} updateAction={updatePostAction.bind(null, post.id)} deleteAction={deletePostAction.bind(null, post.id)}>
            <Input name="title" defaultValue={post.title} />
            <Input name="slug" defaultValue={post.slug} />
            <Input name="category" defaultValue={post.category || ""} />
            <Input name="author" defaultValue={post.author || ""} />
            <Textarea name="excerpt" defaultValue={post.excerpt} />
            <Textarea name="content" defaultValue={(post.content as { body?: string }).body || JSON.stringify(post.content, null, 2)} />
            <label className="flex gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked={Boolean(post.publishedAt)} /> Publicado</label>
          </EditableRow>
        ))}
      </CmsBlock>

      <CmsBlock title="FAQ" description="Preguntas visibles en home y /faq." createAction={createFaqAction} fields={["question", "answer", "category", "position"]}>
        {faqs.map((faq) => (
          <EditableRow key={faq.id} title={faq.question} subtitle={faq.category || "FAQ"} updateAction={updateFaqAction.bind(null, faq.id)} deleteAction={deleteFaqAction.bind(null, faq.id)}>
            <Input name="question" defaultValue={faq.question} />
            <Textarea name="answer" defaultValue={faq.answer} />
            <Input name="category" defaultValue={faq.category || ""} />
            <Input name="position" type="number" defaultValue={faq.position} />
            <label className="flex gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={faq.active} /> Activo</label>
          </EditableRow>
        ))}
      </CmsBlock>

      <CmsBlock title="Testimonios" description="Prueba social visible en home." createAction={createTestimonialAction} fields={["quote", "author", "company", "role"]}>
        {testimonials.map((testimonial) => (
          <EditableRow key={testimonial.id} title={testimonial.author} subtitle={testimonial.quote} updateAction={updateTestimonialAction.bind(null, testimonial.id)} deleteAction={deleteTestimonialAction.bind(null, testimonial.id)}>
            <Textarea name="quote" defaultValue={testimonial.quote} />
            <Input name="author" defaultValue={testimonial.author} />
            <Input name="company" defaultValue={testimonial.company || ""} />
            <Input name="role" defaultValue={testimonial.role || ""} />
            <label className="flex gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={testimonial.active} /> Activo</label>
          </EditableRow>
        ))}
      </CmsBlock>

      <Card>
        <CardHeader>
          <CardTitle>Logos de clientes</CardTitle>
          <CardDescription>Empresas para las que se realizaron trabajos de topografia. No pertenecen a la tienda.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form action={createClientLogoAction} className="grid gap-3 rounded-md border bg-muted/40 p-4 md:grid-cols-2">
            <Input name="name" placeholder="Nombre del cliente" />
            <Input name="sector" placeholder="Sector o tipo de proyecto" />
            <Input name="website" placeholder="Web opcional" />
            <Input name="position" type="number" placeholder="Orden" defaultValue={0} />
            <ClientLogoUploader />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked /> Activo</label>
            <FormSubmitButton idleLabel="Crear logo" pendingLabel="Creando..." />
          </form>
          <div className="space-y-4">
            {clientLogos.map((clientLogo) => (
              <EditableRow key={clientLogo.id} title={clientLogo.name} subtitle={clientLogo.sector || "Cliente topografico"} updateAction={updateClientLogoAction.bind(null, clientLogo.id)} deleteAction={deleteClientLogoAction.bind(null, clientLogo.id)}>
                <div className="rounded-md border bg-white p-4">
                  <div className="relative h-16 w-full">
                    <Image src={clientLogo.logoUrl} alt={`Logo de ${clientLogo.name}`} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-contain object-left" unoptimized />
                  </div>
                </div>
                <Input name="name" defaultValue={clientLogo.name} />
                <Input name="sector" defaultValue={clientLogo.sector || ""} />
                <Input name="website" defaultValue={clientLogo.website || ""} />
                <Input name="position" type="number" defaultValue={clientLogo.position} />
                <ClientLogoUploader initialLogoUrl={clientLogo.logoUrl} />
                <label className="flex gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={clientLogo.active} /> Activo</label>
              </EditableRow>
            ))}
          </div>
        </CardContent>
      </Card>

      <CmsBlock title="Banners" description="Banners promocionales preparados para home/campanas." createAction={createBannerAction} fields={["title", "subtitle", "ctaLabel", "ctaHref", "image", "placement"]}>
        {banners.map((banner) => (
          <EditableRow key={banner.id} title={banner.title} subtitle={banner.placement} updateAction={updateBannerAction.bind(null, banner.id)} deleteAction={deleteBannerAction.bind(null, banner.id)}>
            <Input name="title" defaultValue={banner.title} />
            <Input name="subtitle" defaultValue={banner.subtitle || ""} />
            <Input name="ctaLabel" defaultValue={banner.ctaLabel || ""} />
            <Input name="ctaHref" defaultValue={banner.ctaHref || ""} />
            <Input name="image" defaultValue={banner.image || ""} />
            <Input name="placement" defaultValue={banner.placement} />
            <label className="flex gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={banner.active} /> Activo</label>
          </EditableRow>
        ))}
      </CmsBlock>

      <CmsBlock title="Paginas CMS" description="Paginas corporativas editables para futuras secciones." createAction={createCmsPageAction} fields={["title", "slug", "metaTitle", "metaDesc", "content"]}>
        {pages.map((page) => (
          <EditableRow key={page.id} title={page.title} subtitle={page.slug} updateAction={updateCmsPageAction.bind(null, page.id)} deleteAction={deleteCmsPageAction.bind(null, page.id)}>
            <Input name="title" defaultValue={page.title} />
            <Input name="slug" defaultValue={page.slug} />
            <Input name="metaTitle" defaultValue={page.metaTitle || ""} />
            <Input name="metaDesc" defaultValue={page.metaDesc || ""} />
            <Textarea name="content" defaultValue={(page.content as { body?: string }).body || JSON.stringify(page.content, null, 2)} />
            <label className="flex gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked={page.isPublished} /> Publicada</label>
          </EditableRow>
        ))}
      </CmsBlock>
    </section>
  );
}

function CmsBlock({ title, description, createAction, fields, children }: { title: string; description: string; createAction: (formData: FormData) => Promise<void>; fields: string[]; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createAction} className="grid gap-3 rounded-md border bg-muted/40 p-4 md:grid-cols-2">
          {fields.map((field) => field === "content" || field === "summary" || field === "excerpt" || field === "answer" || field === "quote"
            ? <Textarea key={field} name={field} placeholder={field} />
            : <Input key={field} name={field} placeholder={field} />)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={title === "FAQ" || title === "Testimonios" || title === "Banners" ? "active" : "isPublished"} defaultChecked /> Publicar / activar</label>
          <FormSubmitButton idleLabel="Crear" pendingLabel="Creando..." />
        </form>
        <div className="space-y-4">{children}</div>
      </CardContent>
    </Card>
  );
}

function EditableRow({ title, subtitle, updateAction, deleteAction, children }: { title: string; subtitle: string; updateAction: (formData: FormData) => Promise<void>; deleteAction: () => Promise<void>; children: ReactNode }) {
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="mb-3">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <form action={updateAction} className="grid gap-3 md:grid-cols-2">{children}<FormSubmitButton idleLabel="Guardar cambios" pendingLabel="Guardando..." /></form>
      <form action={deleteAction} className="mt-3"><FormSubmitButton idleLabel="Eliminar" pendingLabel="Eliminando..." variant="destructive" /></form>
    </div>
  );
}
