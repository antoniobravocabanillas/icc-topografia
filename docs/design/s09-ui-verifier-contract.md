# S09: interfaz pública y contrato QA

Referencia inspeccionada: `C:/Users/Binv/Downloads/02-ui-ux-pantallas.pdf`, página 10, y `output/s06-ux.txt`, líneas 411–416. Se conserva identidad Terraqo, cabecera compacta, trabajos con imagen inicial, estado individual y contexto lateral. Móvil apila el contenido. No se implementa S10 ni se modifica su navegación, búsqueda o calendario.

## Integración

- `app/cv/[username]/page.tsx` espera `declaredAvailabilityDate(profile)` junto con las selecciones antes del render. `PublicCVPage` recibe `availabilityUpdatedAt: Date | null`. La disponibilidad solo se muestra como declarada con esa fecha; `null` muestra **Sin declaración fechada**, sin usar `OPEN_TO_PROJECTS` predeterminado ni `profile.updatedAt` como evidencia. La fecha de actualización del perfil se etiqueta por separado.
- Enlace accesible **Contactar** a `/cv/{username}/contacto`, `prefetch=false`; `data-context-href=/cv/{username}`. La continuación segura y la autorización pertenecen a Main/backend. No hay enlace si `messagePrivacy === NOBODY`; el vacío tampoco ofrece contactar en ese caso.
- Publicaciones individuales provienen del filtro autorizado que mantiene Main: personales, `PUBLISHED`, `PUBLIC`, sin eliminar. El componente no consulta ni cuenta trabajo privado. Material empresarial únicamente por `cases` autorizados, con su límite de acceso existente.
- Sin `user.email`; sin lecturas de `project.clientName`. El CV inicial no renderiza documentos crudos, conteos de documentos ni métricas agregadas de reputación. Se retiran paneles duplicados de proyectos/evidencias; se conserva experiencia y formación pública y capacidades declaradas.
- Avatar oficial o iniciales; imágenes de trabajo desde el endpoint público autorizado, sin sustituir por medios privados o de proyecto. Ausencia/error de imagen muestra **Sin imagen pública**, incluido error anterior a hidratación.
- Estados por registro: `DECLARED`/`LINKED` → **Declarado**, `VERIFIED` → **Revisado**, `CONFIRMED` → **Confirmado**. El texto de respaldo aclara alcance por trabajo; no presenta un sello para toda la persona.

## Selectores coordinados con QA

- `s09-profile`: `main` público; h1 con nombre del profesional.
- `s09-availability`: región con **Disponibilidad declarada**, estado y fecha específica o ausencia de declaración.
- `s09-contact`: enlace **Contactar**, omitido con privacidad `NOBODY`.
- `s09-work-{id}`: `article` del registro individual; `s09-work-status-{id}`: estado textual.
- `s09-empty`: **Este profesional todavía no ha compartido trabajos públicos**, sin conteos privados; contacto permitido en el panel lateral.
- Navegación **Bitácoras**: `/cv/{username}/evidencias`; enlace de tarjeta **Ver bitácora** a `/cv/{username}/evidencias/{id}`; **Respaldo** a `#respaldo`.
- **Descargar CV**: `/api/terraqo/cv/{username}/pdf`.

## Validación reproducible

1. `node scripts/fixtures/s09-harness.mjs`: fixture local en `127.0.0.1:3199`, sin cargar env ni base de datos; archivos generados bajo `output/s09-ui-fixture`.
2. `node scripts/test-s09-cv-browser.mjs`.

PASS local: 1440/375/320 px; identidad, iniciales y foto; imágenes iniciales, ausentes y fallidas; estados individuales; enlaces canónicos y contexto de contacto; enlace PDF; ausencia de canarios de cliente/documento; vacío sin conteos privados; disponibilidad fechada, sin fecha y no disponible; privacidad `NOBODY`; nombre largo y texto al 200 % sin overflow; foco visible y navegación por teclado; destino `#respaldo`; cero errores JS. Detector Impeccable: sin hallazgos. Capturas desktop/móvil y vacío inspeccionadas.

Artefactos: `output/s09-reference-page10.png`, `output/s09-ui-{1440,375,320}.png`, `output/s09-empty-320.png`, `output/s09-large-text-320.png`, `output/s09-ui-results.txt`.

Estáticos al entregar: PASS ESLint focalizado (ruta, tres componentes y tres archivos de prueba/fixture); PASS diff-check focalizado; PASS `npx tsc --noEmit` global después de incorporar la entrada del verificador QA. El primer typecheck encontró la entrada QA aún ausente; se preservó el runner y la repetición cerró ese bloqueo. Fixture detenido; ninguna validación UI sigue ejecutándose.

Las pruebas locales usan datos y respuestas de medios sintéticos. Comprueban composición, estados y destinos; no certifican login real, autorización servidor, entrega de contacto, bytes de medios productivos ni generación de PDF. Esos comportamientos corresponden al gate integrado de Main/QA. Sin commit ni despliegue.
