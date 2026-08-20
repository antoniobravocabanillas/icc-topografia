import type { ReactNode } from "react";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import type { ClientLogo, Sector, Service, ServiceCategory } from "@prisma/client";
import { ClientLogoUploader } from "@/components/admin/client-logo-uploader";
import { CmsSectionHeading, CreatePanel, EditablePanel } from "@/components/admin/cms/collapsible-editor";
import { CmsWorkspaceNav, type CmsSectionId } from "@/components/admin/cms/cms-workspace-nav";
import { FormSubmitButton } from "@/components/admin/form-submit-button";
import { ServiceAutoFields } from "@/components/admin/service-auto-fields";
import { ServiceCoverUploader } from "@/components/admin/service-cover-uploader";
import { ServiceIconUploader } from "@/components/admin/service-icon-uploader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { safeDb } from "@/lib/server/safe-db";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
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
    contentStatus?: string;
    item?: string;
    section?: string;
  }>;
};

const blogStatusMessages: Record<string, string> = {
  created: "Post creado y publicado correctamente.",
  updated: "Cambios del blog guardados correctamente.",
  deleted: "Post eliminado correctamente."
};

const contentStatusMessages: Record<string, string> = {
  created: "Contenido creado correctamente.",
  updated: "Cambios guardados correctamente.",
  deleted: "Contenido eliminado correctamente."
};

const serviceStatusOptions = [
  ["ACTIVE", "Activo / disponible"],
  ["FEATURED", "Servicio destacado"],
  ["IN_DEVELOPMENT", "En desarrollo"],
  ["PAUSED", "Pausado"],
  ["ARCHIVED", "Archivado"]
] as const;

const cmsSectionIds = new Set<CmsSectionId>(["services", "sectors", "blog", "faq", "clients", "testimonials", "banners", "pages"]);

export default async function AdminContentPage({ searchParams }: AdminContentPageProps) {
  await requireAdminPage(["EDITOR", "ADMIN"]);
  const terraqoWorkspaceId = await getSessionTerraqoWorkspaceId();
  await requireWorkspaceModule("PUBLIC_WEBSITE", terraqoWorkspaceId);
  const resolvedSearchParams = await searchParams;
  const blogStatus = resolvedSearchParams?.blogStatus;
  const blogStatusMessage = blogStatus ? blogStatusMessages[blogStatus] : null;
  const contentStatus = resolvedSearchParams?.contentStatus;
  const contentStatusMessage = contentStatus ? contentStatusMessages[contentStatus] : null;
  const requestedSection = resolvedSearchParams?.section as CmsSectionId | undefined;
  const activeSection = requestedSection && cmsSectionIds.has(requestedSection) ? requestedSection : "services";
  const [services, serviceCategories, sectors, posts, faqs, testimonials, clientLogos, banners, pages] = await Promise.all([
    safeDb("admin content services", prisma.service.findMany({ where: { terraqoWorkspaceId }, orderBy: { updatedAt: "desc" } }), [] as Service[]),
    safeDb("admin content service categories", prisma.serviceCategory.findMany({ where: { terraqoWorkspaceId }, orderBy: [{ parentId: "asc" }, { position: "asc" }, { name: "asc" }] }), [] as ServiceCategory[]),
    safeDb("admin content sectors", prisma.sector.findMany({ where: { terraqoWorkspaceId }, orderBy: [{ position: "asc" }, { name: "asc" }] }), [] as Sector[]),
    safeDb("admin content posts", prisma.blogPost.findMany({ where: { terraqoWorkspaceId }, orderBy: { updatedAt: "desc" } }), []),
    safeDb("admin content faqs", prisma.faq.findMany({ where: { terraqoWorkspaceId }, orderBy: [{ position: "asc" }, { createdAt: "desc" }] }), []),
    safeDb("admin content testimonials", prisma.testimonial.findMany({ where: { terraqoWorkspaceId }, orderBy: { createdAt: "desc" } }), []),
    safeDb("admin content client logos", prisma.clientLogo.findMany({ where: { terraqoWorkspaceId }, orderBy: [{ position: "asc" }, { createdAt: "desc" }] }), []),
    safeDb("admin content banners", prisma.banner.findMany({ where: { terraqoWorkspaceId }, orderBy: { createdAt: "desc" } }), []),
    safeDb("admin content pages", prisma.cmsPage.findMany({ where: { terraqoWorkspaceId }, orderBy: { updatedAt: "desc" } }), [])
  ]);

  const counts: Record<CmsSectionId, number> = {
    services: services.length,
    sectors: sectors.length,
    blog: posts.length,
    faq: faqs.length,
    clients: clientLogos.length,
    testimonials: testimonials.length,
    banners: banners.length,
    pages: pages.length
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-[#d2e0de] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Workspace de contenido</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Contenidos CMS</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Administra por separado los servicios, referencias y contenidos que ICC Topografia publica en su web.</p>
        </div>
        <div className="rounded-md border border-[#d8e0ec] bg-white px-4 py-3 text-sm shadow-technical">
          <span className="font-mono font-bold text-primary">{Object.values(counts).reduce((total, count) => total + count, 0)}</span>
          <span className="ml-2 text-muted-foreground">contenidos administrados</span>
        </div>
      </div>

      {blogStatusMessage || contentStatusMessage ? (
        <div className="flex items-start gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">{blogStatusMessage || contentStatusMessage}</p>
            {resolvedSearchParams?.item ? <p className="mt-1 text-emerald-800">{resolvedSearchParams.item}</p> : null}
          </div>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[280px_minmax(0,1fr)] xl:gap-8">
        <CmsWorkspaceNav activeSection={activeSection} counts={counts} />
        <div className="min-w-0 rounded-md border border-[#cbdedc] bg-[#fbfcfa] p-4 shadow-technical sm:p-6 xl:p-8">
          {activeSection === "services" ? <ServiceAdminSection services={services} categories={serviceCategories} sectors={sectors} /> : null}
          {activeSection === "sectors" ? <SectorAdminSection sectors={sectors} /> : null}

          {activeSection === "blog" ? <CmsBlock title="Blog" eyebrow="Publicaciones" description="Articulos, novedades y contenido editorial visible en /blog." createLabel="articulo" count={posts.length} createAction={createPostAction} fields={["title", "slug", "excerpt", "content", "category", "author"]}>
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
          </CmsBlock> : null}

          {activeSection === "faq" ? <CmsBlock title="Preguntas frecuentes" eyebrow="Ayuda al cliente" description="Preguntas y respuestas visibles en la web y en /faq." createLabel="pregunta" count={faqs.length} createAction={createFaqAction} fields={["question", "answer", "category", "position"]}>
        {faqs.map((faq) => (
          <EditableRow key={faq.id} title={faq.question} subtitle={faq.category || "FAQ"} updateAction={updateFaqAction.bind(null, faq.id)} deleteAction={deleteFaqAction.bind(null, faq.id)}>
            <Input name="question" defaultValue={faq.question} />
            <Textarea name="answer" defaultValue={faq.answer} />
            <Input name="category" defaultValue={faq.category || ""} />
            <Input name="position" type="number" defaultValue={faq.position} />
            <label className="flex gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={faq.active} /> Activo</label>
          </EditableRow>
        ))}
          </CmsBlock> : null}

          {activeSection === "testimonials" ? <CmsBlock title="Testimonios" eyebrow="Confianza" description="Experiencias de clientes que respaldan el trabajo publicado en la web." createLabel="testimonio" count={testimonials.length} createAction={createTestimonialAction} fields={["quote", "author", "company", "role"]}>
        {testimonials.map((testimonial) => (
          <EditableRow key={testimonial.id} title={testimonial.author} subtitle={testimonial.quote} updateAction={updateTestimonialAction.bind(null, testimonial.id)} deleteAction={deleteTestimonialAction.bind(null, testimonial.id)}>
            <Textarea name="quote" defaultValue={testimonial.quote} />
            <Input name="author" defaultValue={testimonial.author} />
            <Input name="company" defaultValue={testimonial.company || ""} />
            <Input name="role" defaultValue={testimonial.role || ""} />
            <label className="flex gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={testimonial.active} /> Activo</label>
          </EditableRow>
        ))}
          </CmsBlock> : null}

          {activeSection === "clients" ? <ClientLogosAdminSection clientLogos={clientLogos} /> : null}

          {activeSection === "banners" ? <CmsBlock title="Banners" eyebrow="Campanas" description="Avisos promocionales preparados para la pagina de inicio y campanas." createLabel="banner" count={banners.length} createAction={createBannerAction} fields={["title", "subtitle", "ctaLabel", "ctaHref", "image", "placement"]}>
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
          </CmsBlock> : null}

          {activeSection === "pages" ? <CmsBlock title="Paginas CMS" eyebrow="Contenido institucional" description="Paginas corporativas editables y preparadas para futuras secciones." createLabel="pagina" count={pages.length} createAction={createCmsPageAction} fields={["title", "slug", "metaTitle", "metaDesc", "content"]}>
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
          </CmsBlock> : null}
        </div>
      </div>
    </section>
  );
}

function CmsBlock({ title, eyebrow, description, createLabel, count, createAction, fields, children }: { title: string; eyebrow: string; description: string; createLabel: string; count: number; createAction: (formData: FormData) => Promise<void>; fields: string[]; children: ReactNode }) {
  const usesActiveField = ["Preguntas frecuentes", "Testimonios", "Banners"].includes(title);

  return (
    <section className="space-y-5">
      <CmsSectionHeading eyebrow={eyebrow} title={title} description={description} count={count} />
      <CreatePanel label={`Crear ${createLabel}`} description="Abre el formulario solo cuando necesites agregar un nuevo registro.">
        <form action={createAction} className="grid gap-3 md:grid-cols-2">
          {fields.map((field) => field === "content" || field === "summary" || field === "excerpt" || field === "answer" || field === "quote"
            ? <Textarea key={field} name={field} placeholder={field} />
            : <Input key={field} name={field} placeholder={field} />)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={usesActiveField ? "active" : "isPublished"} defaultChecked /> Publicar / activar</label>
          <FormSubmitButton idleLabel="Crear" pendingLabel="Creando..." />
        </form>
      </CreatePanel>
      <div className="space-y-3">
        {count ? children : <EmptyContent label={title} />}
      </div>
    </section>
  );
}

function ServiceAdminSection({ services, categories, sectors }: { services: Service[]; categories: ServiceCategory[]; sectors: Sector[] }) {
  const parentCategories = categories.filter((category) => !category.parentId);
  const childCategories = categories.filter((category) => category.parentId);

  return (
    <section className="space-y-6">
      <CmsSectionHeading eyebrow="Catalogo tecnico" title="Servicios" description="Administra las fichas que se publican en /servicios y sus relaciones con sectores y proyectos." count={services.length} />

        <div className="rounded-md border border-[#cbdedc] bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">Catalogo base ICC</p>
              <p className="mt-1 text-sm text-muted-foreground">Carga la estructura inicial únicamente si este workspace todavía no tiene un catálogo configurado.</p>
            </div>
            <form action={seedServiceCatalogAction}>
              <FormSubmitButton idleLabel="Cargar catalogo base" pendingLabel="Cargando..." />
            </form>
          </div>
        </div>

        <div className="space-y-4 rounded-md border border-[#d3e1df] bg-[#f7faf9] p-4 sm:p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h3 className="font-display text-xl font-bold">Categorias</h3>
              <p className="mt-1 text-sm text-muted-foreground">Organiza los servicios antes de crear sus fichas.</p>
            </div>
            <span className="font-mono text-sm font-bold text-primary">{categories.length}</span>
          </div>
          <CreatePanel label="Nueva categoria o subcategoria" description="Define el nombre, jerarquia, orden e informacion SEO.">
            <form action={createServiceCategoryAction} className="space-y-3">
              <ServiceCategoryFields categories={parentCategories} />
              <FormSubmitButton idleLabel="Crear categoria" pendingLabel="Creando..." />
            </form>
          </CreatePanel>
          <div className="space-y-2">
            {categories.map((category) => (
              <EditableRow key={category.id} title={category.name} subtitle={category.parentId ? "Subcategoria" : "Categoria principal"} updateAction={updateServiceCategoryAction.bind(null, category.id)} deleteAction={deleteServiceCategoryAction.bind(null, category.id)}>
                <ServiceCategoryFields category={category} categories={parentCategories.filter((item) => item.id !== category.id)} />
              </EditableRow>
            ))}
            {!categories.length ? <EmptyContent label="categorias" /> : null}
          </div>
        </div>

        <div className="space-y-4">
          <CreatePanel label="Nuevo servicio" description="Abre la ficha técnica y comercial completa para crear un servicio.">
            <form action={createServiceAction} className="space-y-5">
              <ServiceFormFields categories={parentCategories} subcategories={childCategories} sectors={sectors} />
              <FormSubmitButton idleLabel="Crear servicio" pendingLabel="Creando..." />
            </form>
          </CreatePanel>
          <div className="space-y-3">
          {services.map((service) => (
            <EditableRow key={service.id} title={service.title} subtitle={`${service.category || "Sin categoria"} - ${service.slug}`} updateAction={updateServiceAction.bind(null, service.id)} deleteAction={deleteServiceAction.bind(null, service.id)}>
              <ServiceFormFields service={service} categories={parentCategories} subcategories={childCategories} sectors={sectors} />
            </EditableRow>
          ))}
            {!services.length ? <EmptyContent label="servicios" /> : null}
          </div>
        </div>
    </section>
  );
}

function SectorAdminSection({ sectors }: { sectors: Sector[] }) {
  return (
    <section className="space-y-5">
      <CmsSectionHeading eyebrow="Aplicaciones" title="Sectores" description="Organiza las industrias y escenarios donde se aplican los servicios topográficos." count={sectors.length} />
      <CreatePanel label="Nuevo sector" description="Crea una aplicación sectorial con imagen y contenido SEO.">
        <form action={createSectorAction} className="grid gap-3 md:grid-cols-2">
            <SectorFields />
            <FormSubmitButton idleLabel="Crear sector" pendingLabel="Creando..." />
          </form>
      </CreatePanel>
        <div className="space-y-3">
          {sectors.map((sector) => (
            <EditableRow key={sector.id} title={sector.name} subtitle={sector.slug} updateAction={updateSectorAction.bind(null, sector.id)} deleteAction={deleteSectorAction.bind(null, sector.id)}>
              <SectorFields sector={sector} />
            </EditableRow>
          ))}
          {!sectors.length ? <EmptyContent label="sectores" /> : null}
        </div>
    </section>
  );
}

function ClientLogosAdminSection({ clientLogos }: { clientLogos: ClientLogo[] }) {
  return (
    <section className="space-y-5">
      <CmsSectionHeading
        eyebrow="Referencias"
        title="Clientes"
        description="Administra las empresas que aparecen en la seccion de confianza de ICC Topografia. Estos logos son independientes del catalogo de la tienda."
        count={clientLogos.length}
      />

      <CreatePanel label="Nuevo cliente" description="Carga el logo, sus datos de referencia y el enlace al sitio oficial.">
        <form action={createClientLogoAction} className="grid gap-3 md:grid-cols-2">
          <Input name="name" placeholder="Nombre del cliente" required />
          <Input name="website" type="url" placeholder="https://cliente.com" />
          <Input name="sector" placeholder="Sector o industria" />
          <Input name="position" type="number" placeholder="Orden" defaultValue={0} />
          <ClientLogoUploader />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked /> Visible en la web</label>
          <FormSubmitButton idleLabel="Crear cliente" pendingLabel="Creando..." />
        </form>
      </CreatePanel>

      <div className="space-y-3">
        {clientLogos.map((clientLogo) => (
          <EditableRow
            key={clientLogo.id}
            title={clientLogo.name}
            subtitle={clientLogo.sector || clientLogo.website || "Referencia de cliente"}
            updateAction={updateClientLogoAction.bind(null, clientLogo.id)}
            deleteAction={deleteClientLogoAction.bind(null, clientLogo.id)}
          >
            <div className="flex min-h-24 items-center justify-center rounded-md border border-[#d8e5e3] bg-white p-4 md:col-span-2">
              <div className="relative h-16 w-full max-w-52">
                <Image src={clientLogo.logoUrl} alt={`Logo de ${clientLogo.name}`} fill sizes="208px" className="object-contain" unoptimized />
              </div>
            </div>
            <Input name="name" defaultValue={clientLogo.name} placeholder="Nombre del cliente" required />
            <Input name="website" type="url" defaultValue={clientLogo.website || ""} placeholder="https://cliente.com" />
            <Input name="sector" defaultValue={clientLogo.sector || ""} placeholder="Sector o industria" />
            <Input name="position" type="number" defaultValue={clientLogo.position} placeholder="Orden" />
            <ClientLogoUploader initialLogoUrl={clientLogo.logoUrl} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={clientLogo.active} /> Visible en la web</label>
          </EditableRow>
        ))}
        {!clientLogos.length ? <EmptyContent label="clientes" /> : null}
      </div>
    </section>
  );
}

function SectorFields({ sector }: { sector?: Sector }) {
  return (
    <>
      <Input name="name" placeholder="Nombre del sector" defaultValue={sector?.name || ""} />
      <Input name="slug" placeholder="slug-sector" defaultValue={sector?.slug || ""} />
      <Input name="icon" placeholder="Icono lucide opcional" defaultValue={sector?.icon || ""} />
      <Input name="position" type="number" placeholder="Orden" defaultValue={sector?.position ?? 0} />
      <Input name="seoTitle" placeholder="SEO title" defaultValue={sector?.seoTitle || ""} />
      <Textarea name="description" placeholder="Descripcion" defaultValue={sector?.description || ""} />
      <Textarea name="metaDescription" placeholder="Meta description" defaultValue={sector?.metaDescription || ""} />
      <ServiceCoverUploader initialCover={sector?.image || ""} inputName="image" label="Imagen sectorial" description="Se usa como aplicacion visual en la ficha premium de servicios." />
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
    <EditablePanel title={title} subtitle={subtitle} updateAction={updateAction} deleteAction={deleteAction}>
      {children}
    </EditablePanel>
  );
}

function EmptyContent({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-[#c7d9d7] bg-white px-5 py-10 text-center">
      <p className="text-sm font-semibold text-[#34545a]">Aun no hay {label} en este workspace.</p>
      <p className="mt-1 text-xs text-muted-foreground">Usa el formulario superior para crear el primer registro.</p>
    </div>
  );
}
