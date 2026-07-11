# ICC Topografia Web Suite

## 1. Resumen ejecutivo

ICC Topografia Web Suite es una plataforma corporativa y transaccional para ICC Topografia Group S.A.C., empresa de ingenieria, construccion y consultoria especializada en topografia, geodesia, instrumentacion, servicios tecnicos y venta especializada. Su objetivo es combinar autoridad tecnica, captacion de leads, catalogo profesional, tienda online y panel operativo en una arquitectura escalable preparada para Vercel y PostgreSQL.

Decision actual: este proyecto debe evolucionar como el Panel ICC Topografia dentro de Terraqo Workspace. Terraqo tendra una base compartida y paneles separados para ICC GROUP, ICC Topografia y Terraqo Producto/Admin. El panel de ICC Topografia debe operar servicios, venta/alquiler de equipos, clientes, cotizaciones, proyectos, evidencias, entregables, soporte y postventa.

La informacion historica de A&B Topografia Peru se incorpora como base de experiencia: 12 años de conocimiento acumulado, seguridad, cuidado ambiental, planos, interiores/exteriores, construccion, consultoria BIM, geodesia, fotogrametria, topografia, capacitacion, venta, alquiler, reparacion y calibracion de equipos.

Benchmark consultado: Grupo TS, con foco en precision milimetrica, archivo de proyectos, soluciones por tecnologia, certificaciones, homologaciones y CTA comerciales de presupuesto.

## 2. Arquitectura tecnica

- Frontend: Next.js App Router, TypeScript, Tailwind CSS y componentes estilo shadcn/ui.
- Backend: Route Handlers de Next.js para catalogo, categorias, servicios, blog, FAQ, formularios, cotizacion, checkout, cuenta, favoritos, CRM, pedidos y administracion.
- Datos: PostgreSQL con Prisma ORM.
- Auth: NextAuth v5 con Prisma Adapter y provider credentials inicial.
- Workspace/Admin: panel propio en `/admin` como primera version del Panel ICC Topografia, con APIs protegidas por rol para productos, categorias, servicios, blog, FAQ, pedidos, leads, clientes, oportunidades, cotizaciones, ventas, proyectos, tickets, reportes y mensajes.
- SEO: metadata por pagina, sitemap, robots, URLs limpias y contenido semantico.
- Seguridad: headers basicos, validacion Zod, variables de entorno, separacion de admin.
- Autorizacion: roles `CUSTOMER`, `SALES`, `EDITOR` y `ADMIN` aplicados en endpoints administrativos.
- Deploy: Vercel + PostgreSQL gestionado.

## 2.1 Arquitectura Terraqo Workspace

El desarrollo debe seguir esta separacion:

```txt
Terraqo Workspace
  -> Panel ICC GROUP
  -> Panel ICC Topografia
  -> Panel Terraqo Producto/Admin
```

La base de datos debe mantenerse compartida para evitar duplicidad de empresas, contactos, clientes, oportunidades, proyectos, documentos y actividades. Los paneles deben separar experiencia, permisos, navegacion y prioridades operativas.

### Panel ICC Topografia

Este repo implementa la primera version funcional del Panel ICC Topografia. Debe concentrarse en:

- Servicios topograficos.
- Venta, alquiler y soporte de equipos.
- Clientes de servicios.
- Clientes de ventas de equipos.
- Leads y oportunidades.
- Cotizaciones.
- Ventas.
- Proyectos de campo.
- Evidencias, avances y entregables.
- Tickets, soporte, calibracion y postventa.
- Publicacion de servicios, productos y proyectos hacia la web publica.

### Panel ICC GROUP

Debe construirse como una vista separada sobre la misma base, no como otro sistema aislado. Debe concentrarse en:

- Cuentas estrategicas.
- Oportunidades corporativas.
- Propuestas institucionales.
- Proyectos integrales.
- Alianzas.
- Reportes ejecutivos.
- Visibilidad cruzada de unidades.

### Panel Terraqo Producto/Admin

Debe administrar la evolucion del workspace:

- Modulos productizables.
- Configuracion de unidades.
- Roles y permisos globales.
- Plantillas.
- Taxonomias compartidas.
- Analitica de uso.
- Preparacion comercial de herramientas vendibles.

La primera capa operativa ya vive en `/admin/terraqo`. Desde ahi Terraqo puede
ver clientes/workspaces, plan vigente y modulos activos. Esto evita tratar a ICC
Topografia como "el sistema completo": ICC Topografia es un cliente/workspace de
Terraqo, y Terraqo es el producto que habilita o deshabilita capacidades.

### Modelo activable Terraqo

Terraqo vende capacidades por modulo y por plan. La base inicial contempla:

- `CRM`: leads, clientes, oportunidades, cotizaciones, ventas y seguimiento.
- `PROJECTS`: proyectos, hitos, tareas, evidencias, documentos y entregables.
- `PUBLIC_WEBSITE`: sitio publico conectado al workspace.
- `TECHNICAL_STORE`: tienda tecnica, cotizaciones, venta, alquiler y soporte.
- `PROFESSIONAL_NETWORK`: red profesional tipo comunidad/marketplace.
- `LIVE_CV`: CV vivo validado por participacion real en proyectos.
- `JOB_MARKETPLACE`: convocatorias, postulaciones privadas y seleccion.
- `FORUMS`: foros, consultas y conversaciones por rubro o comunidad.
- `DOCUMENTS`: data room, entregables privados y control documental.
- `ANALYTICS` y `AUTOMATIONS`: capas avanzadas para planes Enterprise.

Los planes (`FREE`, `BASIC`, `PROFESSIONAL`, `PREMIUM`, `ENTERPRISE`) no deben
ser solo etiquetas comerciales. Deben controlar permisos, visibilidad y acceso
a modulos. Un profesional puede tener su propio perfil y suscripcion premium,
mientras que una empresa cliente puede contratar un workspace con modulos de
software.

### Red profesional y CV vivo

La red profesional no debe limitarse a topografia. Debe soportar cualquier rubro
que Terraqo pueda vender. Los perfiles profesionales pueden indicar
disponibilidad, especialidad, experiencia, herramientas, software, portafolio,
postulaciones y participacion en proyectos. La experiencia validada nace del
proyecto real y puede alimentar un CV vivo privado o visible segun suscripcion y
permisos.

Las postulaciones, proyectos, perfiles y experiencia validada deben tener control
de visibilidad: publico, comunidad, workspace o privado. Esto permite que Terraqo
opere como software, red profesional, marketplace laboral y base operativa sin
exponer informacion sensible.

### Regla de desarrollo

Cada modulo nuevo debe indicar:

- A que panel pertenece.
- Que entidad compartida usa.
- Que datos produce.
- Que flujo operativo resuelve.
- Como podria convertirse en modulo vendible de Terraqo.

## 3. Arbol de carpetas

```txt
app/
  (site)/                 Rutas corporativas y comerciales
  (commerce)/             Checkout y cuenta
  admin/                  Panel ICC Topografia / workspace operativo
  api/                    Auth, contacto, cotizacion, checkout
  globals.css             Tokens visuales y Tailwind
components/
  ui/                     Componentes base estilo shadcn
  forms/                  Formularios reutilizables
lib/
  content/                Semilla editorial y comercial
  prisma.ts               Cliente Prisma
  seo.ts                  Helper de metadata
  utils.ts                Utilidades compartidas
prisma/
  schema.prisma           Modelo de datos completo
  seed.ts                 Datos realistas del sector
docs/
  architecture.md         Producto, sitemap, flujos y fases
```

## 4. Modelo de datos

El schema cubre usuarios, roles, cuentas NextAuth, productos, categorias, variantes, pedidos, items, direcciones, favoritos, servicios, paginas CMS, banners, testimonios, FAQ, blog posts, leads y mensajes de contacto. Tambien incluye una base tipo workspace para empresas, contactos, clientes, oportunidades, cotizaciones, ventas, proyectos, tareas, hitos, documentos, tickets, perfiles de staff, notificaciones, comisiones, chats y actividad.

Entidades principales:

- `User`, `Account`, `Session`, `VerificationToken`
- `Category`, `Product`, `ProductVariant`, `Favorite`
- `Order`, `OrderItem`, `Address`
- `Service`, `CmsPage`, `Banner`, `Testimonial`, `Faq`, `BlogPost`
- `Lead`, `ContactMessage`
- `Company`, `Contact`, `Client`, `ClientAccount`
- `Opportunity`, `Quote`, `QuoteItem`, `Sale`, `Commission`
- `Project`, `ProjectImage`, `ProjectProgress`, `Milestone`, `Task`, `Document`
- `Ticket`, `TicketMessage`, `StaffProfile`, `ActivityLog`, `Notification`
- `TerraqoWorkspace`, `TerraqoWorkspaceModule`, `TerraqoSubscription`
- `TerraqoWorkspaceMember`, `TerraqoProfessionalProfile`, `TerraqoProfessionalExperience`
- `TerraqoJobPost`, `TerraqoProjectApplication`
- `TerraqoForumChannel`, `TerraqoForumPost`, `TerraqoForumReply`

## 5. Sistema de componentes

- Tokens: azul ICC principal, celeste corporativo, azul profundo institucional, blanco tecnico y fondos claros de alta legibilidad.
- Componentes base: `Button`, `Card`, `Badge`, `Input`, `Textarea`.
- Componentes de negocio: `SiteHeader`, `SiteFooter`, `SectionHeading`, `ProductCard`, `ConversionBand`, `ContactForm`.
- Principios UI: layouts sobrios, cards solo para unidades repetidas, CTA claros, tipografia fuerte, espaciado consistente y jerarquia B2B.

## 6. Sitemap

- `/`
- `/nosotros`
- `/servicios`
- `/servicios/[slug]`
- `/proyectos`
- `/sectores`
- `/tienda`
- `/tienda/[slug]`
- `/blog`
- `/blog/[slug]`
- `/contacto`
- `/cotizacion`
- `/faq`
- `/privacidad`
- `/terminos`
- `/checkout`
- `/cuenta`
- `/admin`
- `/admin/productos`
- `/admin/pedidos`
- `/admin/contenidos`
- `/admin/leads`

## 7. Flujos de usuario

- Lead de servicio: Home -> Servicios -> Servicio individual -> formulario contextual -> `Lead`.
- Compra consultiva: Tienda -> ficha de producto -> cotizar o asesor -> `Lead`.
- Compra directa: Tienda -> ficha con precio -> carrito -> checkout -> `Order`.
- Autoridad SEO: Blog -> post tecnico -> CTA final -> cotizacion.
- Operacion ICC Topografia: Panel ICC Topografia -> leads/clientes/oportunidades/cotizaciones/ventas/proyectos/evidencias/productos/pedidos/tickets/reportes.
- Operacion ICC GROUP futura: Panel ICC GROUP -> cuentas estrategicas/oportunidades corporativas/propuestas/proyectos integrales/reportes ejecutivos.
- Productizacion Terraqo: Panel Terraqo Producto/Admin -> modulos/configuracion/permisos/plantillas/metricas de uso.

## 7.1 Endpoints backend iniciales

- Publicos: `GET /api/products`, `GET /api/products/[slug]`, `GET /api/categories`, `GET /api/services`, `GET /api/blog`, `GET /api/faqs`.
- Conversion: `POST /api/contact`, `POST /api/quote`, `POST /api/checkout`.
- Cuenta: `POST /api/auth/register`, `GET/POST/DELETE /api/account/favorites`.
- Admin: `/api/admin/dashboard`, `/api/admin/products`, `/api/admin/categories`, `/api/admin/services`, `/api/admin/posts`, `/api/admin/faqs`, `/api/admin/leads`, `/api/admin/contact-messages`, `/api/admin/orders`.
- Terraqo: `GET/POST /api/terraqo/workspaces`, `GET/PATCH /api/terraqo/workspaces/[slug]/modules`, `GET/PUT /api/terraqo/professional-profile`.

## 8. Plan por fases

1. Base tecnica: Next.js, Tailwind, Prisma, Auth, SEO, contenido semilla.
2. Comercial: home premium, servicios, tienda, fichas, formularios y rutas SEO.
3. E-commerce: carrito persistente, checkout real, pedidos, favoritos y cuenta.
4. Admin: CRUD completo con permisos, upload de fichas, banners, CMS y blog.
5. Separacion de paneles: formalizar `/admin` como Panel ICC Topografia, preparar rutas o namespaces para Panel ICC GROUP y Panel Terraqo Producto/Admin.
6. Integraciones: WhatsApp, GA4, Meta Pixel, email marketing, pasarela de pago.
7. Produccion: hardening, tests, performance, accesibilidad, legal y analitica.

## 9. Instalacion y despliegue

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run dev
```

Para Vercel: configurar `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, conectar PostgreSQL, ejecutar migraciones y desplegar.
