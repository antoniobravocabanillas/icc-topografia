import type { ReactNode } from "react";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import type { Sector, Service, ServiceCategory } from "@prisma/client";
import { ClientLogoUploader } from "@/components/admin/client-logo-uploader";
import { FormSubmitButton } from "@/components/admin/form-submit-button";
import { ServiceAutoFields } from "@/components/admin/service-auto-fields";
import { ServiceCoverUploader } from "@/components/admin/service-cover-uploader";
import { ServiceIconUploader } from "@/components/admin/service-icon-uploader";
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
  createSectorAction,
  createServiceAction,
  createServiceCategoryAction,
  createTestimonialAction,
  deleteBannerAction,
  deleteClientLogoAction,
  deleteCmsPageAction,
  deleteFaqAction,
  deletePostAction,
  deleteSectorAction,
  deleteServiceAction,
  deleteServiceCategoryAction,
  deleteTestimonialAction,
  seedServiceCatalogAction,
  updateBannerAction,
  updateClientLogoAction,
  updateCmsPageAction,
  updateFaqAction,
  updatePostAction,
  updateSectorAction,
  updateServiceAction,
  updateServiceCategoryAction,
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

const serviceStatusOptions = [
  ["ACTIVE", "Activo / disponible"],
  ["FEATURED", "Servicio destacado"],
  ["IN_DEVELOPMENT", "En desarrollo"],
  ["PAUSED", "Pausado"],
  ["ARCHIVED", "Archivado"]
] as const;

export default async function AdminContentPage({ searchParams }: AdminContentPageProps) {
  await requireAdminPage(["EDITOR", "ADMIN"]);
  const resolvedSearchParams = await searchParams;
  const blogStatus = resolvedSearchParams?.blogStatus;
  const blogStatusMessage = blogStatus ? blogStatusMessages[blogStatus] : null;
  const services = await prisma.service.findMany({ orderBy: { updatedAt: "desc" } });
  const serviceCategories = await prisma.serviceCategory.findMany({ orderBy: [{ parentId: "asc" }, { position: "asc" }, { name: "asc" }] });
  const sectors = await prisma.sector.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] });
  const posts = await prisma.blogPost.findMany({ orderBy: { updatedAt: "desc" } });
  const faqs = await prisma.faq.findMany({ orderBy: [{ position: "asc" }, { createdAt: "desc" }] });
  const testimonials = await prisma.testimonial.findMany({ orderBy: { createdAt: "desc" } });
  const clientLogos = await prisma.clientLogo.findMany({ orderBy: [{ position: "asc" }, { createdAt: "desc" }] });
  const banners = await prisma.banner.findMany({ orderBy: { createdAt: "desc" } });
  const pages = await prisma.cmsPage.findMany({ orderBy: { updatedAt: "desc" } });

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

      <ServiceAdminSection services={services} categories={serviceCategories} sectors={sectors} />

      <SectorAdminSection sectors={sectors} />

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

function ServiceAdminSection({ services, categories, sectors }: { services: Service[]; categories: ServiceCategory[]; sectors: Sector[] }) {
  const parentCategories = categories.filter((category) => !category.parentId);
  const childCategories = categories.filter((category) => category.parentId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Servicios</CardTitle>
        <CardDescription>Contenido consumido por /servicios, fichas individuales y futuras relaciones con proyectos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border bg-muted/30 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">Catalogo base ICC</p>
              <p className="mt-1 text-sm text-muted-foreground">Crea o actualiza las categorias y servicios recomendados para topografia, geomatica, catastro, mineria y consultoria.</p>
            </div>
            <form action={seedServiceCatalogAction}>
              <FormSubmitButton idleLabel="Cargar catalogo base" pendingLabel="Cargando..." />
            </form>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <form action={createServiceCategoryAction} className="space-y-3 rounded-md border bg-muted/40 p-4">
            <p className="font-semibold">Nueva categoria / subcategoria</p>
            <ServiceCategoryFields categories={parentCategories} />
            <FormSubmitButton idleLabel="Crear categoria" pendingLabel="Creando..." />
          </form>
          <div className="space-y-3">
            {categories.map((category) => (
              <EditableRow key={category.id} title={category.name} subtitle={category.parentId ? "Subcategoria" : "Categoria principal"} updateAction={updateServiceCategoryAction.bind(null, category.id)} deleteAction={deleteServiceCategoryAction.bind(null, category.id)}>
                <ServiceCategoryFields category={category} categories={parentCategories.filter((item) => item.id !== category.id)} />
              </EditableRow>
            ))}
          </div>
        </div>

        <form action={createServiceAction} className="space-y-5 rounded-md border bg-muted/40 p-4">
          <ServiceFormFields categories={parentCategories} subcategories={childCategories} sectors={sectors} />
          <FormSubmitButton idleLabel="Crear servicio" pendingLabel="Creando..." />
        </form>
        <div className="space-y-5">
          {services.map((service) => (
            <EditableRow key={service.id} title={service.title} subtitle={`${service.category || "Sin categoria"} - ${service.slug}`} updateAction={updateServiceAction.bind(null, service.id)} deleteAction={deleteServiceAction.bind(null, service.id)}>
              <ServiceFormFields service={service} categories={parentCategories} subcategories={childCategories} sectors={sectors} />
            </EditableRow>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SectorAdminSection({ sectors }: { sectors: Sector[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sectores</CardTitle>
        <CardDescription>Aplicaciones visibles en /sectores y en las fichas premium de servicios.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createSectorAction} className="grid gap-3 rounded-md border bg-muted/40 p-4 md:grid-cols-2">
          <SectorFields />
          <FormSubmitButton idleLabel="Crear sector" pendingLabel="Creando..." />
        </form>
        <div className="space-y-4">
          {sectors.map((sector) => (
            <EditableRow key={sector.id} title={sector.name} subtitle={sector.slug} updateAction={updateSectorAction.bind(null, sector.id)} deleteAction={deleteSectorAction.bind(null, sector.id)}>
              <SectorFields sector={sector} />
            </EditableRow>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SectorFields({ sector }: { sector?: Sector }) {
  return (
    <>
      <Input name="name" placeholder="Nombre del sector" defaultValue={sector?.name || ""} />
      <Input name="slug" placeholder="slug-sector" defaultValue={sector?.slug || ""} />
      <Input name="icon" placeholder="Icono lucide opcional" defaultValue={sector?.icon || ""} />
      <Input name="position" type="number" placeholder="Orden" defaultValue={sector?.position ?? 0} />
      <Input name="image" placeholder="URL de imagen sectorial" defaultValue={sector?.image || ""} />
      <Input name="seoTitle" placeholder="SEO title" defaultValue={sector?.seoTitle || ""} />
      <Textarea name="description" placeholder="Descripcion" defaultValue={sector?.description || ""} />
      <Textarea name="metaDescription" placeholder="Meta description" defaultValue={sector?.metaDescription || ""} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={sector?.active ?? true} /> Activo</label>
    </>
  );
}

function ServiceCategoryFields({ category, categories }: { category?: ServiceCategory; categories: ServiceCategory[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Input name="name" placeholder="Nombre de categoria" defaultValue={category?.name || ""} />
      <Input name="slug" placeholder="slug-categoria" defaultValue={category?.slug || ""} />
      <Textarea name="description" placeholder="Descripcion" defaultValue={category?.description || ""} />
      <Input name="seoTitle" placeholder="SEO title" defaultValue={category?.seoTitle || ""} />
      <Textarea name="metaDescription" placeholder="Meta description" defaultValue={category?.metaDescription || ""} />
      <Input name="position" type="number" placeholder="Orden" defaultValue={category?.position ?? 0} />
      <select name="parentId" defaultValue={category?.parentId || ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
        <option value="">Categoria principal</option>
        {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <ServiceIconUploader initialIcon={category?.icon || ""} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={category?.active ?? true} /> Activa</label>
    </div>
  );
}

function ServiceFormFields({ service, categories, subcategories, sectors }: { service?: Service; categories: ServiceCategory[]; subcategories: ServiceCategory[]; sectors: Sector[] }) {
  const serviceContent = service?.content;
  const contentValue = serviceContent && typeof serviceContent === "object" && !Array.isArray(serviceContent) && Object.keys(serviceContent as Record<string, unknown>).length
    ? JSON.stringify(service.content, null, 2)
    : "";

  return (
    <div className="space-y-5 md:col-span-2">
      <AdminFieldGroup title="Informacion">
        <ServiceAutoFields title={service?.title || ""} slug={service?.slug || ""} headline={service?.headline || ""} summary={service?.summary || ""} seoTitle={service?.seoTitle || ""} metaDescription={service?.metaDescription || ""} />
        <Input name="category" placeholder="Categoria: Campo, Gabinete, Soporte..." defaultValue={service?.category || ""} />
        <select name="categoryId" defaultValue={service?.categoryId || ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Categoria principal</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <select name="subcategoryId" defaultValue={service?.subcategoryId || ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Subcategoria opcional</option>
          {subcategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <select name="status" defaultValue={service?.status || "ACTIVE"} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          {serviceStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isFeatured" defaultChecked={service?.isFeatured || false} /> Destacado</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked={service?.isPublished ?? true} /> Publicado</label>
      </AdminFieldGroup>

      <AdminFieldGroup title="Visual">
        <ServiceIconUploader initialIcon={service?.icon || ""} />
        <ServiceCoverUploader initialCover={service?.cover || ""} />
        <Textarea name="gallery" placeholder="URLs de galeria, una por linea" defaultValue={joinLines(service?.gallery)} />
        <Input name="video" placeholder="URL de video opcional" defaultValue={service?.video || ""} />
      </AdminFieldGroup>

      <AdminFieldGroup title="Comercial">
        <Textarea name="benefits" placeholder="Beneficios, uno por linea" defaultValue={joinLines(service?.benefits)} />
        <Textarea name="applications" placeholder="Aplicaciones o usos, uno por linea" defaultValue={joinLines(service?.applications)} />
        <Textarea name="deliverables" placeholder="Entregables, uno por linea" defaultValue={joinLines(service?.deliverables)} />
      </AdminFieldGroup>

      <AdminFieldGroup title="Tecnico">
        <Textarea name="technologies" placeholder="Tecnologias/equipos, uno por linea" defaultValue={joinLines(service?.technologies)} />
        <Input name="precision" placeholder="Precision o tolerancia aplicable" defaultValue={service?.precision || ""} />
        <Textarea name="formats" placeholder="Formatos de entrega, uno por linea" defaultValue={joinLines(service?.formats)} />
        <Textarea name="compatibility" placeholder="Compatibilidad CAD/GIS/BIM/sistemas, uno por linea" defaultValue={joinLines(service?.compatibility)} />
      </AdminFieldGroup>

      <AdminFieldGroup title="SEO y relaciones">
        <Input name="ogImage" placeholder="OG image" defaultValue={service?.ogImage || ""} />
        <Textarea name="sectorSlugs" placeholder="Slugs de sectores/aplicaciones, uno por linea" defaultValue={joinLines(service?.sectorSlugs)} />
        <Textarea name="relatedProjects" placeholder="Slugs de proyectos relacionados, uno por linea" defaultValue={joinLines(service?.relatedProjects)} />
        <Textarea name="successCases" placeholder="Casos de exito relacionados, uno por linea" defaultValue={joinLines(service?.successCases)} />
        <Textarea name="relatedServices" placeholder="Slugs de servicios relacionados, uno por linea" defaultValue={joinLines(service?.relatedServices)} />
      </AdminFieldGroup>
      {sectors.length ? (
        <div className="rounded-md border bg-muted/35 p-4 text-xs text-muted-foreground">
          Sectores disponibles: {sectors.map((sector) => sector.slug).join(", ")}
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Contenido legacy / notas</p>
        <Textarea name="content" placeholder='{"problem":"...","process":["..."]}' defaultValue={contentValue} />
      </div>
    </div>
  );
}

function AdminFieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-md border bg-background/70 p-4 md:grid-cols-2">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function joinLines(items?: string[] | null) {
  return (items || []).join("\n");
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
