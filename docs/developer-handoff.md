# Terraqo — Guía de estructura y transferencia técnica

Fecha: 14 de septiembre de 2026. Código contrastado: commit `50fbf32`, rama `codex/icc-production-preview`.

## 1. Qué proyecto estás recibiendo

Terraqo es un producto de VRILLA S.A.C. Este repositorio contiene la aplicación principal: sitio público, portal profesional, administración, APIs y servicios. Es un monolito modular sobre Next.js App Router, React, TypeScript, Prisma y PostgreSQL; no un conjunto de microservicios independientes.

La carpeta local se llama `icc-topografia` y el paquete `icc-geo-commerce`: son nombres históricos, no una indicación de que todo el sistema pertenezca a la empresa ICC. El repositorio remoto es `antoniobravocabanillas/icc-topografia`.

Ruta inspeccionada: `C:/Users/Binv/Documents/New project/icc-topografia`.

**No confundir** con `C:/Users/Binv/Documents/ICC TOPOGRAFIA`, repositorio `antoniobravocabanillas/icctopografia.com`: ese es el sitio comercial separado que consume servicios de Terraqo.

La guía describe estructura y puntos de intervención comprobados. No acredita disponibilidad actual de proveedores, cobertura completa de pruebas ni certificación de seguridad/ISO.

## 2. Mapa rápido de la raíz

| Carpeta | Qué contiene / para qué sirve | Tratamiento |
|---|---|---|
| `app/` | Rutas Next.js, layouts, páginas, endpoints y metadatos. Es la entrada a las funcionalidades. | Código fuente; revisar permisos y resolución de rutas antes de cambiar. |
| `components/` | Componentes React reutilizables y pantallas funcionales. | Código fuente; separar interacción cliente de operaciones servidor. |
| `lib/` | Servicios de dominio, acceso a datos, validación, autenticación, proveedores y utilidades. | Código crítico de negocio. |
| `prisma/` | Modelo de datos, migraciones y scripts de inicialización/provisionamiento. | Cambios con impacto persistente. No ejecutar seeds contra producción por defecto. |
| `public/` | Recursos estáticos servidos por URL: identidad visual, imágenes y otros assets. | No guardar documentos privados ni secretos aquí. |
| `emails/` | Plantillas React Email; destaca `terraqo-transactional.tsx`. | Presentación de correos, no cola de envío ni credenciales. |
| `netlify/` | Código fuente de funciones programadas. | Versionar; distinto de `.netlify/`. |
| `docs/` | Arquitectura, precios, puesta en marcha, auditorías y QA. | Documentación; contrastar notas antiguas con código vigente. |
| `scripts/` | Pruebas, auditorías, backfills, migraciones y configuración operativa. | Leer cada script antes de ejecutarlo: algunos escriben en DB o proveedores. |
| `types/` | Declaraciones TypeScript complementarias. Actualmente amplía tipos de NextAuth. | Tipos, no validación de seguridad en ejecución. |
| `.netlify/` | Estado local y artefactos de herramientas Netlify. | Generado/local, ignorado por Git. No sustituye la configuración de producción. |
| `.next/` | Compilación y cachés Next.js; puede incluir almacenamiento local de desarrollo. | No editar. No borrar indiscriminadamente si se necesitan evidencias de pruebas locales. |
| `node_modules/` | Dependencias instaladas con npm. | No editar ni versionar; reconstruir desde el lockfile. |
| `.playwright-cli/` | Artefactos locales de automatización del navegador. | No es código de producto; revisar posibles datos de sesiones antes de compartir. |
| `output/` | Resultados locales de trabajo, pruebas o exportaciones. Su significado depende de cada archivo. | No asumir que es la distribución desplegable. Revisar sensibilidad. |
| `tmp/` | Material temporal local. | Revisar propietario y contenido antes de limpiar; no incorporarlo automáticamente al repositorio. |

En la revisión, `.playwright-cli/`, `output/`, `tmp/` y `deno.lock` aparecen sin seguimiento. Esto no significa que todo su contenido sea descartable. No se eliminaron ni modificaron.

## 3. Cómo leer `app/`

Next.js usa convenciones de archivos:

- `page.tsx`: contenido de una ruta.
- `layout.tsx`: estructura compartida de esa ruta y sus descendientes.
- `route.ts`: endpoint HTTP; revisar sus métodos exportados, validación y autorización.
- `loading.tsx`, `error.tsx`, `not-found.tsx`: estados especiales cuando existen.
- `[id]`, `[slug]`, `[workspaceSlug]`: segmentos dinámicos. No son nombres literales de URL.
- `(site)` y `(commerce)`: grupos organizativos; los paréntesis no forman parte de la URL.

### Áreas principales

| Área | Responsabilidad | Precaución |
|---|---|---|
| `app/(site)/` | Organización de páginas públicas. | No asumir que una página pública requiere sesión. |
| `app/(commerce)/` | Agrupación histórica que incluye funcionalidades comerciales y el portal. | El nombre no limita su contenido a una tienda. |
| `app/(commerce)/portal/` | Páginas autenticadas del portal: actividad, red y funcionalidades profesionales. | El subdominio portal reescribe rutas hacia `/portal`. |
| `app/admin/` | Pantallas y operaciones administrativas. | Distinguir administrador de plataforma de administrador de una empresa. |
| `app/admin/terraqo/` | Administración de Terraqo; entrada protegida para `SUPER_ADMIN`. | No conceder este rol para resolver permisos de un workspace. |
| `app/api/` | APIs del producto, APIs públicas conectadas, autenticación y endpoints internos. | “API pública” no significa que cualquier operación o archivo sea accesible sin controles. |
| `app/cv/` | Perfiles públicos y contenidos del CV vivo. | Publicar solo información autorizada. |
| `app/reuniones/[id]/` | Acceso a una reunión identificada. | Validar participantes y autorización, no únicamente la existencia del ID. |
| `app/admin-preview/`, `cms-preview/`, `debug-network/`, `orb-preview/`, `photo-upload-qa/`, `ui-message-audit/` | Superficies de preview, diagnóstico o QA. | Inventariar exposición y protecciones antes de entregar un entorno productivo; sus nombres no garantizan aislamiento. |

`app/layout.tsx` arma el marco global. `app/globals.css` contiene estilos generales. `app/sitemap.ts` y `app/robots.ts` producen recursos de indexación; los metadatos y previews también se resuelven en rutas y servicios específicos.

## 4. Navegación y subdominios

`middleware.ts` decide el destino según el host y agrega cabeceras de seguridad/contexto. Las distintas interfaces pertenecen a la misma aplicación:

| Dirección externa | Resolución relevante |
|---|---|
| `terraqoglobal.com` | Sitio público; accesos a portal/cuenta/admin pueden redirigirse a su host correspondiente. |
| `portal.terraqoglobal.com/` | Reescritura interna hacia `/portal`. |
| `portal.terraqoglobal.com/mensajes` | Reescritura hacia `/portal/mensajes`, salvo reglas específicas. |
| `portal.terraqoglobal.com/producto` | Redirección al sitio público; existe una lista explícita de rutas públicas. |
| `admin.terraqoglobal.com/` | Reescritura hacia `/admin/terraqo`. |
| `api.terraqoglobal.com/` | Reescritura hacia `/api/health`; otras rutas sin prefijo reciben `/api`. |

Hay rutas compartidas como `/api`, `/cuenta`, `/registro`, `/reuniones` y assets. También existen redirecciones históricas en `next.config.ts`. Un error de navegación puede estar en el enlace del componente, en middleware o en estas redirecciones: revisar los tres puntos.

En localhost no se reproduce automáticamente el comportamiento de todos los subdominios. Probar rutas internas no basta para acreditar navegación por hosts.

## 5. Componentes: dónde cambiar la interfaz

| Ubicación | Qué encontrarás |
|---|---|
| `components/ui/` | Primitivas: button, input, textarea, card, badge y `auto-grow-textarea.tsx`. Son la base para mantener comportamiento y accesibilidad consistentes. |
| `components/terraqo/` | Componentes del producto: páginas públicas, perfiles, bitácoras, membresías, mensajes, reuniones, equipos, foros y legal. |
| `components/forms/` | Formularios compartidos y controles de envío. |
| Otros archivos de `components/` | Componentes generales o heredados del sitio. Comprobar imports antes de dar por hecho que siguen activos. |

Puntos frecuentes de intervención:

- Bitácora: `worklog-composer.tsx`, `worklog-card.tsx`, `worklog-continuity-control.tsx`, `worklog-engagement.tsx`.
- Mensajes: `conversation-hub.tsx`, su CSS Module, `message-drawer.tsx`, `composer-tools.tsx`.
- IA de escritura: `writing-mark.tsx` y su CSS Module para la marca; buscar el consumidor del asistente para interacción y estados.
- Membresías: `billing-console.tsx`, `portal-plan-catalog.tsx`, `membership-explorer.tsx`, `terraqo-memberships.tsx`.
- Sitio público: `terraqo-public-header.tsx`, `terraqo-public-footer.tsx`, `terraqo-home-experience.tsx`, `product-journey.tsx`.
- Perfiles públicos: `public-cv.tsx`, `public-cv-activity-explorer.tsx`, `public-cv-project-explorer.tsx`.
- Reclamaciones: `complaint-form.tsx`, `legal-layout.tsx`, `legal.module.css`.

Un archivo con `"use client"` puede manejar estado y APIs del navegador. No debe importar secretos ni servicios exclusivos del servidor. La validación visual del formulario no sustituye validación/autorización en el backend.

## 6. `lib/`: lógica, datos y proveedores

### Subcarpetas

| Carpeta | Responsabilidad | Ejemplos |
|---|---|---|
| `lib/terraqo/` | Servicios y reglas del producto. | `worklog.ts`, `messaging.ts`, `teams.ts`, `forums.ts`, `workspace-access.ts`, `workspace-scope.ts`. |
| `lib/terraqo/billing/` | Catálogo, cobros, permisos por plan y cuotas. | `catalog.ts`, `service.ts`, `provider.ts`, `entitlements.ts`, `storage-quota.ts`. |
| `lib/server/` | Operaciones de servidor, autorización, archivos, correo y Server Actions. | `authz.ts`, `media.ts`, `worklog-evidence.ts`, `message-attachments.ts`, `complaints.ts`. |
| `lib/client/` | Utilidades específicas del navegador. | `secure-notes.ts`: cifrado de notas con Web Crypto. No implica cifrado extremo a extremo de toda la aplicación. |
| `lib/validations/` | Contratos Zod para entradas y entidades. | `terraqo.ts`, `commerce.ts`, `crm.ts`, `common.ts`. |
| `lib/content/` | Definiciones de contenido del sitio. | `site.ts`, `services.ts`, `products.ts`. |

### Archivos y módulos clave

- `lib/prisma.ts`: instancia compartida del cliente Prisma; selección de conexión y rama Accelerate según configuración. Evitar crear clientes nuevos por petición.
- `lib/locations.ts`: catálogo disponible de países/subdivisiones. Reutilizarlo; no inventar catálogos distintos en cada formulario.
- `lib/terraqo-domains.ts`: utilidades relativas a los dominios del producto.
- `lib/utils.ts`: utilidades generales de composición de clases; no convertirlo en contenedor de toda la lógica de negocio.
- `lib/server/authz.ts` y `workspace-action-auth.ts`: comprobaciones de identidad y permisos en servidor.
- `lib/server/workspace-portal-session.ts`: sesión firmada de compatibilidad para portales conectados. Es distinta de la sesión Auth.js principal.
- `lib/server/media.ts`: almacenamiento de binarios en Netlify Blobs o alternativa local de desarrollo.
- `lib/server/private-workspace-storage.ts`: archivos privados y controles de workspace.
- `lib/terraqo/ai-provider.ts`: adaptadores HTTP Groq/OpenAI; `profile-summary.ts` también contempla Ollama/fallback.
- `lib/terraqo/evidence-analysis.ts`: jobs privados T18 con fuentes fijadas, allowlist, citas literales, abstención, límites y reautorización. No reutiliza automáticamente el proveedor general.
- `lib/server/terraqo-observability.ts`: eventos operativos T19 con propiedades permitidas; no agregar texto de documentos, mensajes, identidad, ubicación, prompt o salida del modelo.
- `components/errors/client-feature-boundary.tsx`: recuperación accesible de fallos cliente y telemetría con huellas calculadas antes del envío.
- `lib/terraqo/product-entitlements.ts`: proyección T20 de plan efectivo, concesión de piloto y límites. No acoplar el significado de respaldo al plan.
- `lib/server/chatbot.ts`: asistente comercial de reglas y contenido; no confundirlo con el proveedor generativo.
- `lib/terraqo/public-cv-seo.ts` y `public-company-seo.ts`: metadata de perfiles autorizados para publicación.
- `lib/terraqo/legal.ts`: identidad legal del operador del producto. No sustituir VRILLA por una empresa cliente.

## 7. Persistencia: `prisma/` y archivos

`prisma/schema.prisma` define modelos, relaciones, enums e índices. La base configurada es PostgreSQL. El análisis previo de esta revisión identificó 101 modelos y 21 migraciones SQL; son una foto del commit, no límites de la plataforma.

`prisma/migrations/` conserva cambios incrementales. Una modificación del schema requiere revisar migración, datos existentes, compatibilidad del código y despliegue. No editar una migración ya aplicada para disimular un cambio posterior.

Scripts como `seed.ts`, `seed-terraqo.ts`, `seed-staff.ts`, `create-workspace-admin.ts`, `create-platform-administrators.ts` y `backfill-workspace-ownership.ts` **modifican datos o accesos**. No ejecutarlos para “ver qué hacen”.

Los binarios de fotos y documentos no equivalen a filas Prisma: el almacenamiento guarda bytes y la DB guarda metadatos/referencias. Un registro guardado no garantiza que todos sus adjuntos hayan terminado de subir. El código de bitácoras incluye cargas individuales y recuperación de errores parciales; la cola pendiente de la página no es una cola durable tras cerrar el navegador.

## 8. Pagos, correo y tareas programadas

### Membresías

`billing/catalog.ts` define la oferta técnica; `validation.ts` valida entradas; `authorization.ts`, `owner.ts` y `request-security.ts` delimitan permisos y seguridad; `provider.ts` encapsula Culqi; `service.ts` coordina intentos, suscripciones, cargos y conciliación. `entitlements.ts` traduce el plan a capacidades y `storage-quota.ts` gestiona almacenamiento.

No activar un plan basándose solo en el mensaje de éxito del navegador. Mantener verificación servidor, separación test/live e idempotencia. No confundir membresías Terraqo con pedidos de tienda ICC.

### Correos

`emails/` presenta el mensaje. `lib/server/transactional-email.ts` lo envía mediante Resend. `email-verification.ts` participa en verificación de correo. `complaints.ts` administra reclamaciones y reintentos asociados. Aceptación del proveedor no prueba entrega al buzón.

### Cron

`netlify/functions/billing-reconcile.mts` y `complaints-mail.mts` invocan endpoints internos protegidos cada cinco minutos. Son tareas concretas, no un motor general de workflows. El simulador comercial de `automation-demo.ts` y `automation-simulator.tsx` es una demostración, no ejecución productiva de automatizaciones configurables.

`netlify/functions/evidence-analysis-background.mts` procesa un job T18 concreto y usa `EVIDENCE_ANALYSIS_DISPATCH_SECRET`. No tiene memoria personalizada. La tabla y el flag deben existir antes de habilitarlo; con el proveedor en `off`, la evaluación manual sigue disponible.

## 9. Archivos de configuración de la captura

| Archivo | Función y cuidado |
|---|---|
| `.editorconfig` | UTF-8, LF, nueva línea final y limpieza de espacios. Ayuda a evitar cambios de formato accidentales. |
| `.env` | Configuración sensible local/base. Ignorado por Git. No compartir su contenido. |
| `.env.local` | Configuración local específica; puede contener credenciales. Ignorado por Git. No publicar ni pegar en tickets. |
| `.env.example` | Plantilla de nombres y ejemplos no secretos. No activa configuración por sí sola. Mantenerla actualizada al agregar variables. |
| `.gitignore` | Define qué no se versiona. Ignora `.env`, `.env*.local`, `.next`, `.netlify`, `node_modules` y `*.tsbuildinfo`, entre otros. No cubre necesariamente toda carpeta temporal visible. |
| `auth.ts` | Configuración NextAuth/Auth.js: providers, adaptador Prisma, sesión y callbacks. Revisar junto con autorización servidor. |
| `components.json` | Configuración de generación/composición UI compatible con shadcn: TSX, RSC, Tailwind y aliases. No acredita que todo componente esté generado por esa herramienta. |
| `deno.lock` | Lockfile local sin seguimiento. No se confirmó un runtime Deno necesario para el producto. No cambiar el proyecto a Deno por encontrarlo. |
| `eslint.config.mjs` | Reglas de análisis estático. `npm run lint` falla también ante advertencias por su configuración. |
| `middleware.ts` | Routing por dominio, reescrituras y cabeceras. No es el único control de autorización. |
| `netlify.toml` | Build `npm run build`, publicación `.next`, Node 22 y plugin Next.js. Configuración de despliegue principal encontrada. |
| `next-env.d.ts` | Tipos generados de Next.js. Normalmente no se edita manualmente. |
| `next.config.ts` | Opciones de Next: imágenes remotas, Server Actions y redirecciones heredadas. Un límite de 50 MB aquí no garantiza que el hosting acepte ese tamaño. |
| `package.json` | Dependencias, scripts y requisito de Node. Primera referencia para ejecutar el proyecto. |
| `package-lock.json` | Resolución reproducible de dependencias npm. Versionar junto con cambios intencionales de dependencias. |
| `postcss.config.js` | Transformación CSS con PostCSS/Tailwind/Autoprefixer. |
| `README.md` | Introducción histórica. Revisar vigencia antes de seguir instrucciones de infraestructura. |
| `tailwind.config.ts` | Tokens/extensiones y archivos analizados por Tailwind. |
| `tsconfig.json` | TypeScript estricto, target ES2022, bundler resolution y alias `@/*` hacia raíz. |
| `tsconfig.tsbuildinfo` | Caché incremental TypeScript, ignorada por Git. No contiene la configuración fuente. |
| `vercel.json` | Configuración alternativa Next.js. Su presencia no demuestra despliegue activo en Vercel. |

Una marca `U` en VS Code suele indicar archivo sin seguimiento; un número rojo puede indicar diagnósticos del editor. La captura no basta para atribuir un error concreto: consultar Problems y ejecutar el chequeo correspondiente.

## 10. Flujos para entender el sistema

### Lectura de una página

Navegador → middleware/ruta → página o componente servidor → servicio de dominio → Prisma/PostgreSQL → render. No todas las lecturas SSR pasan por una API HTTP interna.

### Publicar bitácora con fotos

Compositor → API de bitácora → sesión/validación/permisos → persistir registro → preparar fotos → subir evidencia individual → comprobar cuota/propiedad → Blobs + metadatos → actualizar resultado. Revisar registro y adjuntos por separado al diagnosticar fallos parciales.

### Enviar mensaje

Componente de conversación → endpoint/servicio → comprobar participación → guardar mensaje → devolver estado. Archivos/audio pasan además por el servicio de adjuntos. La reunión embebida usa Jitsi; no deducir un servidor propio de videollamadas.

### Cambiar membresía

Catálogo/UI → selección y consentimiento → tokenización Culqi en navegador → validación e intento servidor → operación de proveedor → verificación/conciliación → derechos de cuenta. El procesamiento asíncrono puede continuar mediante cron.

### Solicitar ayuda de escritura

Interfaz → API del asistente → autenticación/contexto permitido → reserva de cuota → proveedor configurado → validación de respuesta → resultado/ajuste de cuota. No enviar indiscriminadamente datos de otros workspaces al modelo.

## 11. Arranque y comandos

Requisito declarado: Node `>=22.13.0`; entorno Netlify configurado para Node 22. Usar npm y el lockfile de este repositorio.

1. Confirmar remoto, rama y cambios locales con `git remote -v`, `git branch --show-current` y `git status --short`.
2. Obtener del responsable las variables de **desarrollo** por un canal seguro. `.env.example` es la lista orientativa, no un juego de credenciales funcionales.
3. Confirmar que DB, almacenamiento y pasarelas corresponden a un entorno aislado. No reutilizar producción por comodidad.
4. Instalar con `npm ci` y generar cliente con `npm run prisma:generate`.
5. Levantar con `npm run dev`. Probar la ruta interna correcta y luego el routing por hosts en un entorno adecuado.

| Comando | Efecto |
|---|---|
| `npm run dev` | Servidor de desarrollo Next. Las acciones de la aplicación pueden escribir en los servicios configurados. |
| `npm run typecheck` | Chequeo TypeScript; puede generar caché incremental local. |
| `npm run lint` | ESLint sin tolerancia a warnings. |
| `npm run check:encoding` | Script de control de codificación. |
| `npm run check:b5-rollout` | Preflight B1–B5 de solo lectura: orden/SQL de migraciones, flags cerrados y worker Starter. No abre la base ni proveedores. |
| `npm run check:b5-schema-drift` | Compara una base B5 confirmada con el datamodel y falla ante drift distinto de los dos artefactos full-text documentados. Requiere variables `B5_GATE_*`; solo lectura. |
| `npm run test:local-disposable-database-guard` | Contrato puro, sin conexión, para la política que protege gates mutantes contra destinos remotos o ambiguos. |
| `npm run test:terraqo-local-contracts` | Puerta secuencial no mutante para higiene del candidato, política de staging, preflight B5 y 32 contratos locales de autenticación, asistencia, bitácora, checkout, CI, B1–B5 y seguridad de runners. Se detiene ante el primer fallo y no reemplaza los gates PostgreSQL/navegador. |
| `npm run test:worklog-isolation` | Fixture mutante sobre un baseline ICC. Exige `WORKLOG_ISOLATION_DATABASE_URL` y `WORKLOG_ISOLATION_EXPECTED_DATABASE`; solo admite PostgreSQL local cuyo nombre declare `gate`, `test` o `disposable`. |
| `npm run test:{messaging,meeting,forum,team,private-storage}-isolation` | Fixtures mutantes de aislamiento. Exigen `ISOLATION_TEST_DATABASE_URL` e `ISOLATION_TEST_EXPECTED_DATABASE` y aplican la misma restricción local/desechable antes de importar Prisma. |
| `npm run test:portal-deployed` | Verificación HTTPS que lee membresías reales y crea un grant de sesión temporal. Exige `TERRAQO_DEPLOYED_PORTAL_TESTS=temporary-session-grant` antes de importar Prisma; no ejecutar como gate local ni sin autorización operativa. |
| `npm run test:b5-multiuser-gate` | Fixture mutante, sintético y autocontenido para piloto/control, idempotencia concurrente, límites, downgrade y flags. Solo admite PostgreSQL local con nombre de base explícitamente aislado. |
| `npm run test:b5-ollama-provider-gate` | Prueba un job T18 real contra Ollama loopback con expediente/fuente sintéticos y limpieza final. Rechaza hosts remotos y no prueba el dispatcher desplegado. |
| `npm run test:b5-browser-accessibility` | Prueba T13–T17 y T20 en portal y panel empresarial con Next/Auth/API/PostgreSQL reales, en 320 px y zoom 200 %. Incluye recuperación sin recarga, teclado y entitlements visibles. Requiere la base local exacta `terraqo_b5_browser_gate`; rechaza cualquier host o base no desechable. |
| `npm run test:platform-staging-b5-readiness` | Gate HTTP sintético del despliegue aislado: piloto/control, entitlements, kill switch T18, UI manual y limpieza. Exige consentimiento remoto exacto; no activa ni llama proveedores. |
| `npm run build` | `prisma generate && next build`; no aplica migraciones. Algunas páginas pueden consultar servicios durante el build. |
| `npm start` | Ejecuta una compilación previamente construida. |
| `npm run prisma:migrate` | `prisma migrate dev`: solo desarrollo y con DB confirmada. |
| `npm run prisma:deploy` | Aplica migraciones pendientes al destino configurado. Requiere plan operativo y respaldo. |
| `npm run prisma:push` | Sincroniza esquema directamente. No reemplaza por defecto el historial de migraciones productivas. |
| `npm run prisma:studio` | Consola de datos con capacidad de edición; no asumir solo lectura. |
| Seeds, provisionamiento y backfills | Modifican datos/accesos. Leer script, confirmar destino y recuperación antes de ejecutar. |
| `test:*`, `workspace:test-isolation`, auditorías | Su nombre no garantiza aislamiento. Algunos crean usuarios/registros o llaman servicios externos. Inspeccionar primero. |

No existe un `npm test` genérico. `npm run test:terraqo-local-contracts` consolida únicamente contratos no mutantes; para B5 todavía se debe seguir `docs/work-documented/b5-rollout-runbook.md`, porque esta puerta no sustituye migración ni recorrido multiusuario en staging. `.github/workflows/quality-gate.yml` ejecuta instalación bloqueada, codificación, lint, tipado y esta puerta local en cada push y pull request; no despliega ni usa secretos.

## 12. Dónde intervenir según la tarea

| Solicitud | Primeros lugares a revisar | Verificación mínima |
|---|---|---|
| Corregir URL/nav/logo | Header/nav, `terraqo-domains.ts`, middleware, redirects Next | Host público, portal, admin y móvil. |
| Cambiar una pantalla | `app/` correspondiente + consumidor en `components/` | Carga, vacío, error, teclado, móvil y contraste. |
| Cambiar campos de formulario | Componente + Zod + servicio + schema si persiste | Validación tanto cliente como servidor y datos existentes. |
| Fotos no adjuntadas | Compositor, `worklog-photo-upload.ts`, `worklog-evidence.ts`, media y cuota | Fotos grandes, envío parcial, reintento y duplicados. |
| Usuario no aparece en red | Consulta pública/perfil, visibilidad, estado de correo | No publicar perfiles privados para resolver una ausencia. |
| Problema de acceso | `auth.ts`, authz, sesión compatible y scope | Usuarios reales de cada rol, no solo SUPER_ADMIN. |
| Plan o límite incorrecto | Catálogo, entitlements, cuotas y billing service | Gratuito/pago, test/live, cancelación y concurrencia. |
| Precio/cobro | Catálogo servidor, validación e idempotencia | Nunca confiar en total del cliente ni activar por callback visual. |
| Correo no llega | Email verification, transactional email, plantilla y estado del proveedor | Distinguir envío solicitado, aceptado, rechazado y entrega. |
| SEO o preview | Ruta, metadata, SEO de CV/empresa, OG y sitemap | HTML público, imagen y ausencia de datos privados. |
| Nueva tabla/campo | Schema + migración + servicio + contratos/UI | Migración sobre copia aislada y compatibilidad de despliegue. |

## 13. Precauciones y deudas que debe conocer quien recibe

- El checkout público de pedidos ICC deriva total, moneda y subtotales exclusivamente del catálogo servidor; rechaza artículos solo cotización, precios no positivos, cantidades fuera del límite y monedas mixtas. `test:public-checkout-pricing` protege este límite. Sigue siendo independiente del checkout recurrente de membresías y no ejecuta cobros.
- `next.config.ts` ya no permite que el optimizador de Next actúe como proxy para cualquier hostname HTTPS. Solo conserva `images.unsplash.com`; las imágenes externas administrables de catálogo y sectores se renderizan con `unoptimized`. `test:image-origin-policy` protege este límite. Los redirects a anchors históricos siguen pendientes de revisión funcional.
- No confundir readiness de DB/proveedores con una respuesta positiva de `/api/health`.
- No se validaron desde esta guía restauración de backups, migración completa desde base vacía, staging aislado ni Culqi live.
- Hay componentes heredados o experimentales. Buscar consumidores con `rg` antes de modificar o eliminar; la dependencia Three.js no demuestra una escena activa en producción.
- El estado de producción puede diferir del código local. Separar siempre commit, despliegue, migración de DB y configuración del proveedor.

## 14. Checklist de entrega entre desarrolladores

- [ ] Confirmar el repositorio correcto y la revisión que se entrega.
- [ ] Documentar trabajo sin commit sin sobrescribir cambios de otra persona.
- [ ] Entregar acceso mediante invitaciones y roles mínimos; no enviar `.env` por correo.
- [ ] Identificar responsables de GitHub, Netlify, PostgreSQL/Accelerate, Blobs, Culqi, Resend y proveedores IA.
- [ ] Confirmar entornos separados y las variables requeridas sin exponer valores.
- [ ] Ejecutar checks estáticos y pruebas apropiadas en entorno aislado; registrar resultados reales.
- [ ] Probar usuario gratuito, suscriptor, administrador de empresa y SUPER_ADMIN con límites distintos.
- [ ] Revisar errores parciales de archivos, idempotencia de pagos y aislamiento entre workspaces.
- [ ] Acordar procedimiento de migración, publicación, observación y rollback.
- [ ] Actualizar esta guía y documentación de arquitectura cuando cambie el sistema.

## 15. Referencias de apoyo

- Arquitectura detallada: informe `arquitectura-terraqo-2026-09-14.md` en la carpeta `entregables` del workspace de documentación ICC.
- Mapa editable: https://whimsical.com/vrilla-terraqo/terraqo-arquitectura-real-2026-09-14-6HaV6S7nXkdxAbD2Bfu6HB
- En este repositorio: `docs/architecture.md`, `docs/billing-pricing-model.md`, `docs/culqi-activation.md`, `docs/legal-culqi-readiness.md`, `docs/qa/worklog-photos-2026-09-13.md` y `docs/qa/mensajes-2026-09-11.md`.

Esta transferencia se elaboró mediante inspección de estructura, manifests, configuración, tipos, middleware y análisis arquitectónico previo del mismo commit. No se abrieron valores secretos de `.env`/`.env.local`, no se ejecutaron cobros ni migraciones y no se modificó el código funcional.
