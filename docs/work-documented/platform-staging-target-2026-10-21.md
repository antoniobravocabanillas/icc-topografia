# Destino PostgreSQL exclusivo de staging

Fecha de registro: 21 de octubre de 2026 (America/Lima).

## Identidad confirmada

| Campo | Valor |
| --- | --- |
| Proveedor | Supabase |
| Organizacion | `Vrilla SAC` |
| Plan observado | Free |
| Proyecto | `Terraqo Platform Staging` |
| Project ref | `mghdpciewbsowjrjwmwk` |
| Region | Sao Paulo (`sa-east-1`) |
| Host directo | `db.mghdpciewbsowjrjwmwk.supabase.co` |
| Base administrada | `postgres` |
| Motor | PostgreSQL 17 |
| Version observada | 17.11 |
| Estado | `ACTIVE_HEALTHY` |
| Coste cotizado | USD 0 mensual |

## Verificaciones realizadas

- La API de administracion devolvio la organizacion, nombre, project ref,
  region y host anteriores.
- Una consulta SQL de solo lectura confirmo `current_database() = postgres`,
  `current_user = postgres` y PostgreSQL 17.11.
- El ledger Prisma contiene 43 migraciones completas, sin entradas incompletas
  ni revertidas.
- El esquema `public` no contiene tablas.
- El Advisor reporta RLS deshabilitado en `icc`; el esquema no concede `USAGE`
  ni permisos de tabla a `PUBLIC`, `anon`, `authenticated` o `service_role`, y
  no esta previsto exponerlo al Data API. No se habilito RLS sin politicas.
- El contrato local reconoce tanto la conexion directa como el transaction
  pooler solo cuando contienen el project ref exacto.
- Un project ref, proveedor, nombre de recurso o base discordante falla antes
  de abrir una conexion.
- `npm run check:platform-staging` aprobo contra la identidad no secreta real
  usando una credencial efimera no funcional solo para validar la estructura;
  el script no abrio conexiones ni imprimio secretos.
- El baseline pre-B1 se genera sin filas desde el datamodel exacto del commit
  `e6ff153694dc01ab8a2b5848556fa6839626b2af`. El artefacto local ignorado pesa
  179.376 bytes y tiene SHA-256
  `047440ba921d38f9539821ce3a8ab8930b4f08e6e17a3c9398e796e6ced9c4b5`.
- El manifiesto separa 36 migraciones historicas y las siete migraciones B1-B5.
- El runner v2 con proceso PostgreSQL controlado directamente aprobo el ensayo
  desechable: 43 entradas Prisma completas, siete migraciones B1-B5, seis
  objetos clave, indice GIN valido/listo, cero filas de aplicacion y solo los
  dos artefactos full-text de drift esperados. El cluster se detuvo y limpio.
- El baseline y las siete migraciones se promovieron despues al destino remoto
  usando el Session pooler oficial `aws-1-sa-east-1.pooler.supabase.com:5432`.
- La verificacion remota confirmo ledger `43:43:0`, seis objetos clave, GIN
  valido/listo, cero filas de aplicacion, `public` sin tablas y solo los dos
  artefactos full-text de drift esperados.

## Configuracion no secreta del gate

```dotenv
PLATFORM_STAGING_CONFIRM=staging
PLATFORM_STAGING_ALLOW_REMOTE=true
PLATFORM_STAGING_DATABASE_PROVIDER=supabase
PLATFORM_STAGING_RESOURCE_NAME="Terraqo Platform Staging"
PLATFORM_STAGING_SUPABASE_PROJECT_REF=mghdpciewbsowjrjwmwk
PLATFORM_STAGING_DATABASE_ROLE=terraqo_staging_runtime
B5_GATE_EXPECTED_DATABASE=postgres
```

La activacion controlada de T18 utiliza ademas
`PLATFORM_STAGING_PROVIDER_CONFIRM=groq|openai`. El valor debe coincidir con
`TERRAQO_EVIDENCE_ANALYSIS_PROVIDER`; con proveedor `off` queda vacio. El
preflight exige una unica cohorte piloto y B1-B4 activos antes de aceptar
`TERRAQO_EVIDENCE_ANALYSIS_V1=true`.

El rol runtime tambien quedo registrado como variable no secreta en el sitio
Netlify aislado `terraqo-platform-staging`; conserva DML sobre `icc` sin DDL y
los flags de producto y proveedores externos permanecen apagados.

`B5_GATE_DATABASE_URL`, `AUTH_SECRET` y
`EVIDENCE_ANALYSIS_DISPATCH_SECRET` son secretos operativos. Deben generarse y
guardarse en el contexto de staging; no pertenecen a este documento, Git, logs
ni mensajes.

## Aplicacion Netlify aislada

El 22 de octubre de 2026 se creo el sitio aislado
Netlify `terraqo-platform-staging`:

- Site ID: `6b8c43fb-6083-450a-9b85-46a820fb6358`.
- URL reservada: `https://terraqo-platform-staging.netlify.app`.
- Plan observado: Free (`nf_team_dev`).
- Sin dominio personalizado, repositorio ni CI.
- Deploy aislado inicial validado: `6add4b1827c97b3b16ae86a4`.
- Deploy vigente tras endurecer replay concurrente: `6add4e394d17c7cb1c4722b6`.
- Revision desplegada vigente: `4313f2d`.
- Deploy vigente tras rotar secretos y agregar el gate HTTP autenticado:
  `6ade1221ccadb571feeebdfe` (revision `6583ec9`).
- Deploy de cohorte B1-B2 validado:
  `6ade14b5864af4857af4b077` (revision `016c182`).
- Deploy de cohorte B1-B3 validado:
  `6ade9e2f128c017cba733295` (revision `c8848ec`).
- Deploy de cohorte B1-B4 validado:
  `6adfe769a843183fbe090819`.
- Ensayo de rollback B4 con flags apagados:
  `6ae034aad34c092236a4dea7` (revision candidata `ffe13b5`).
- Restauracion B1-B4 posterior al rollback:
  `6ae035a47a8bf812cb457057` (revision candidata `ffe13b5`).
- Carga remota de evidencia profesional:
  `6ae424f68bb42eedf27df92e` (revision `0979d71`).
- Portada profesional desacoplada del workspace comercial publico:
  `6ae42ae7786a4cd557f6fad4` (revision `909131e`).
- Guard de superficies URL aisladas:
  `6ae42d75179ec9a602d9993b` (revision `f8243f3`).
- Callbacks de verificacion y cambio de correo aislados:
  `6ae42f40f8d72f7d408e28b7` (revision `62d3f73`).
- Schedulers aislados por deployment y credenciales exclusivas de staging:
  `6ae4478b49094462c6cdb4a5` (revision `9e2ea15`).
- Skip seguro de conciliacion con proveedor apagado y cron final limpio:
  `6ae44a22faa10dea72d3a653` (revision `2f75982`).
- Polling adaptativo de alertas/mensajes y aislamiento del entorno efimero de
  preflight antes del build:
  `6ae44fa4085faf34750b8d15` (revision `782861b`, incluye `938e072`).
- URL validada: `https://terraqo-platform-staging.netlify.app`.

Se configuraron la identidad no secreta de Supabase, URLs del sitio y los nueve
flags B1-B5. La cohorte vigente habilita B1-B4:
`TERRAQO_WORKLOG_FTS_V1`, `TERRAQO_WORK_CASES_V1`,
`TERRAQO_SCOPED_SHARING_V1`, `TERRAQO_SCOPED_ENDORSEMENTS_V1`,
`TERRAQO_DISCOVERY_NEEDS_V1`, `TERRAQO_CONTEXTUAL_MESSAGING_V1`,
`TERRAQO_COLLABORATION_V1` y `TERRAQO_CLOSURE_V1`; B5 permanece en `false` y
su proveedor continúa `off`. El preflight exige que todo flag activo aparezca en
`PLATFORM_STAGING_ENABLED_FLAGS` y que
`PLATFORM_STAGING_ACTIVATION_CONFIRM=cohort`, por lo que una activacion heredada
o accidental falla antes del deploy. El proveedor de analisis esta `off`, el
proveedor IA legacy en `none` y se generaron secretos exclusivos para Auth.js y
el dispatcher en el contexto `production` del sitio de staging.

Netlify hereda variables compartidas del equipo. Por eso staging exige
`TERRAQO_OAUTH_ENABLED=false` y
`TERRAQO_TRANSACTIONAL_EMAIL_ENABLED=false`: ambos controles se aplican en el
servidor y prevalecen aunque existan credenciales OAuth o Resend heredadas. No
se habilitaran hasta ejecutar pruebas sinteticas especificas.

## Estado y siguiente gate

El destino esta reservado, identificado y migrado, pero permanece sin datos de
aplicacion. Esta evidencia no autoriza despliegue. Estado del gate:

1. [Completado] Credencial migradora exclusiva, rotada y deshabilitada al cierre.
2. [Completado] Ensayar el baseline y las migraciones en PostgreSQL desechable.
3. [Completado] Preflight remoto con flags apagados, proveedor IA `off`, cohorte
   vacia y URLs HTTPS exclusivas de staging.
4. [Completado] Baseline, 36 resoluciones historicas y siete migraciones B1-B5.
5. [Completado] Ledger, objetos, GIN, cero filas y drift remoto.
6. [Completado] Rol runtime con `USAGE` y DML sobre `icc`, sin `CREATE`, probado
   por conexion directa y transaction pooler. `DATABASE_URL` esta guardada como
   secreto solo en Netlify staging; el migrador permanece `NOLOGIN`.
7. [Completado B1-B2] Revision candidata desplegada y E2E sintetico autenticado.
8. [Completado B3] Comparticion y respaldos validados con identidades y
   workspaces sinteticos.
9. [Completado B4] Necesidad, dossier, mensajería contextual, propuesta
   versionada, cierre bilateral y constancia privada validados.
10. Pendiente: activar y validar B5, observar rollback y cerrar los gates
    humanos/externos.

No se reutiliza el proyecto `Terraqo`; su nombre no declara staging y pertenece
a una superficie distinta.

## Incidente de configuracion evitado

Netlify CLI resolvia el build con el sitio enlazado localmente y daba prioridad
a `.env` y `.env.local` del checkout sobre la configuracion remota. Dos builds
preliminares de staging heredaron URLs y acceso de produccion, por lo que se
descartaron como evidencia. No se desplego esa configuracion en produccion ni se
modificaron filas productivas.

Antes del candidato valido se corrigieron las variables del sitio productivo
que habian sido alteradas durante la preparacion, se retiraron todas las claves
exclusivas de staging y se verificaron su host Prisma, URLs y ausencia de flags
B1-B5. Produccion no fue redesplegada.

El procedimiento reproducible queda en `scripts/deploy-platform-staging.ps1`.
Falla si el Site ID no es el esperado, si el checkout no esta enlazado al sitio
aislado, si Git esta sucio o si el preflight rechaza variables. Durante el build
aparta los dos archivos `.env` locales en rutas exactas dentro del repositorio y
los restaura en `finally`.

## Evidencia del despliegue aislado

- Preflight: proveedor Supabase, project ref y rol runtime exactos, URLs HTTPS
  exclusivas de staging, nueve flags apagados, OAuth/correo apagados y proveedor
  de analisis `off`.
- Conteo previo por rol runtime: cero usuarios y cero bitacoras.
- HTTP: `/api/health`, `/`, `/cuenta` y `/red` respondieron `200`;
  `/api/v1/entitlements` respondio `401`; recursos B1-B5 inexistentes
  respondieron `404` sin filtrar datos.
- Auth.js expuso solo `credentials`; OAuth no quedo habilitado por herencia.
- Navegador real: home sin movimientos publicos, `/red` con cero perfiles,
  ningun enlace HTTP a produccion o localhost y cero errores de consola en la
  red publica.
- Revision visual: desktop completo y cuenta movil a 390 x 844. El unico warning
  observado fue un preload CSS no consumido inmediatamente; no afecta datos,
  navegacion ni autenticacion.
- Gate B5 remoto con fixtures sinteticos: dos usuarios y dos workspaces,
  piloto/control, replay concurrente, limite mensual, downgrade y flags. Un
  conflicto serializable `P2034` detectado por PostgreSQL remoto se corrigio con
  replay idempotente y reintento acotado; la repeticion aprobo sin duplicados.
- Limpieza posterior comprobada: cero usuarios, workspaces, necesidades y
  suscripciones en staging.
- Gate HTTP B1/B2 con dos sesiones reales de Credentials: anonimo rechazado,
  WorkCase creado, bitacora duplicada rechazada, lista ajena vacia y mutacion
  cruzada rechazada. El primer ciclo detecto una FK restrictiva en la limpieza;
  se corrigio el orden y la repeticion termino con cero usuarios, bitacoras,
  WorkCases y workspaces.
- Gate visual B1/B2 en navegador real: `/portal/bitacora` mostro
  `Continuidad del trabajo`, compositor, archivo, calendario y filtros. La
  captura reproducible quedo en
  `output/playwright/platform-staging-b1-b2.png`; el runner confirma la UI y
  limpia todos los fixtures al finalizar.
- Gate HTTP B3 con tres sesiones y dos workspaces: replay idempotente,
  aislamiento por identidad, caducidad, revocacion privada y publica,
  proyeccion por campos, bloqueo de material empresarial, decision concurrente
  `200/409` y revalidacion de autoridad empresarial. El gate detecto que
  PostgreSQL `40001` en un `SELECT ... FOR UPDATE` llegaba como Prisma `P2010`;
  el retry quedo acotado exclusivamente a serializacion, `P2034` y colisiones
  idempotentes `P2002`.
- Gate visual B3 en navegador real: `/portal/selecciones` y
  `/portal/respaldos` mostraron compositores, alcance, grants, proyecciones y
  estados de revision. Capturas:
  `output/playwright/platform-staging-b3-selections.png` y
  `output/playwright/platform-staging-b3-endorsements.png`.
- Limpieza B3 comprobada por el runner: cero usuarios, workspaces, bitacoras,
  selecciones y solicitudes de respaldo al finalizar.
- Gate HTTP/UI B4 con tres identidades y dos workspaces: necesidad versionada,
  discovery explicable, dossier privado, contexto protegido, replay,
  colisión, propuesta v2, versión sustituida rechazada, cierre bilateral y
  constancia privada. El gate detectó y corrigió un timeout Prisma `P2028` de
  la transacción remota sin ampliar los reintentos a errores ambiguos.
- Capturas B4 hidratadas:
  `output/playwright/platform-staging-b4-needs.png` y
  `output/playwright/platform-staging-b4-collaboration.png`.
- Limpieza B4 comprobada de forma independiente: cero usuarios, workspaces,
  bitácoras, necesidades, dossiers, solicitudes, colaboraciones y constancias.
- Gate B5 directo repetido el 27 de octubre de 2026: preflight no mutante,
  drift remoto por session pooler y fixture multiusuario por transaction pooler
  aprobados. La concurrencia produjo un conflicto serializable esperado y el
  replay acotado mantuvo una sola operación efectiva.
- Limpieza B5 comprobada de forma independiente: cero usuarios, workspaces,
  necesidades y jobs de análisis.
- El checker de drift ahora corta a los 120 segundos: un transaction pooler no
  puede dejar bloqueado indefinidamente el introspector de Prisma.
- Gate HTTP B5 de readiness aprobado con dos sesiones y dos workspaces:
  el piloto conservó B1–B4 activos, el control quedó `PENDING_PILOT`, T18
  permaneció `DISABLED`, el `POST /api/v1/analysis-jobs` respondió `404`, el
  análisis automático no se renderizó y la evaluación manual siguió visible.
- Evidencia visual:
  `output/playwright/platform-staging-b5-readiness-pilot.png` y
  `output/playwright/platform-staging-b5-readiness-control.png`.
- Limpieza HTTP B5 independiente: cero usuarios, workspaces y jobs.
- Rollback B4 observado el 27 de octubre de 2026: se apagaron discovery,
  mensajeria contextual, colaboracion y cierre; el preflight acepto unicamente
  B1-B3 y los cuatro endpoints devolvieron `404`. No se revirtio schema ni se
  eliminaron estados historicos.
- Restauracion observada: se repuso la cohorte B1-B4, se desplego el mismo
  commit inmutable y el gate autenticado completo volvio a aprobar replay,
  aislamiento, propuesta v2, cierre y constancia privada.
- Limpieza posterior a la restauracion: cero usuarios, workspaces,
  necesidades, colaboraciones, constancias y jobs de analisis.
- El cockpit profesional `/portal` respondio autenticado aun sin workspace
  comercial publico; la experiencia historica y su PDF siguieron visibles en
  `/portal/experiencias`, con cero errores y cero warnings de consola.
- Los redirects de verificacion de correo y cambio de correo apuntan al host
  canonico de staging; los enlaces Profesional y Empresa permanecen en el
  mismo origen y `/api/auth/providers` expone unicamente `credentials`.

## Aislamiento de schedulers y evidencia de cron

El 30 de octubre de 2026 se cerraron dos riesgos operativos adicionales:

- los targets de limpieza, reclamaciones y conciliacion se derivan del
  deployment actual; una mezcla staging/produccion o un entorno no reconocido
  falla antes de cualquier request;
- staging usa credenciales distintas para limpieza documental y conciliacion,
  mientras produccion conserva sus nombres historicos;
- las rutas internas y los wrappers resuelven la misma credencial segun el
  deployment y conservan comparacion constante;
- facturacion sin `CULQI_MODE` valido responde `status=disabled` antes de abrir
  PostgreSQL, en lugar de generar un falso incidente cada cinco minutos.

La configuracion final fue verificada por la API Netlify, no por la salida del
CLI: Site ID staging con exactamente dos variables `isSecret=true`, contexto
`production`, scopes `builds/functions/runtime` y sin `post_processing`; Site ID
productivo con cero variables de staging. El CLI `env:set --site` habia usado el
sitio enlazado localmente y creo temporalmente dos claves con nombre de staging
en la configuracion productiva. Se detectaron por inventario API, se retiraron
antes de cualquier deploy productivo y se confirmo nuevamente conteo cero. No
se cambio codigo, deploy ni datos de produccion durante esa remediacion.

Evidencia del ciclo natural de las 02:45 America/Lima sobre
`6ae44a22faa10dea72d3a653`:

- `education-evidence-cleanup` encolo el worker sin `JOB_NOT_CONFIGURED`;
- `education-evidence-cleanup-background` ejecuto sin warning;
- `professional-document-cleanup` y `complaints-mail` ejecutaron sin warning;
- `billing-reconcile` ejecuto sin error y omitio trabajo porque el proveedor de
  cobros permanece deliberadamente apagado.

Los gates locales posteriores aprobaron 39 contratos no mutantes, typecheck,
lint y build de 100 paginas. El checkout restauro el Site ID productivo, `.env`
y `.env.local`; no quedaron archivos hold ni cambios sin commit.

El E2E activo de proveedor B5, accesibilidad fisica, dispatcher HTTPS,
rollback observado y firmas siguen pendientes; por ello el release permanece
en HOLD.

## Limpieza de fixture residual antes de B5 activo

El 30 de octubre de 2026 se retiró el único fixture residual del gate de
evidencias de experiencia. La operación se limitó al proyecto Supabase
`mghdpciewbsowjrjwmwk` y al Site ID Netlify
`6b8c43fb-6083-450a-9b85-46a820fb6358`.

- El primer intento desde SQL Editor fue rechazado por PostgreSQL antes de
  modificar datos: `postgres` tenía lectura, mientras
  `terraqo_staging_migrator` era propietario y
  `terraqo_staging_runtime` conservaba DML.
- Netlify ocultó correctamente `DATABASE_URL` al CLI local. No se degradaron
  permisos ni se reactivó el migrador.
- Se desplegó un worker efímero únicamente en staging, protegido por Site ID,
  project ref, rol runtime, origen, token de un solo uso e invariantes globales
  exactas. La transacción exigió una sola cuenta sintética, cero workspaces,
  jobs y bitácoras, e IDs conocidos antes de borrar.
- La verificación independiente por el conector Supabase confirmó cero filas en
  usuarios, workspaces, perfiles, experiencias, evidencia, buckets de uso,
  tokens, jobs de análisis y bitácoras.
- Netlify Blobs confirmó lista vacía para la clave física exacta del fixture.
- El worker fue retirado y el candidato limpio se redesplegó como
  `6ae47d7f11e562ded300ea13`: `/api/health` respondió `200` y la función retirada
  respondió `404`.
- `.env`, `.env.local` y el enlace local Netlify fueron restaurados; producción
  no recibió deploy, DDL ni mutaciones.

## Gate físico B5: dispatcher y proveedor externo

El 30 de octubre de 2026 se ejecutó el gate físico del dispatcher HTTPS con un
fixture sintético aislado y `TERRAQO_EVIDENCE_ANALYSIS_V1=false`. La cohorte B5
permaneció vacía durante toda la prueba.

El primer job reveló dos fallos de empaquetado del worker standalone:

1. `evidence-analysis.ts` importaba los roles administrativos desde
   `workspace-access.ts`, que depende de `next/headers`.
2. Después de separar los roles, el zip seguía incluyendo
   `server-only/index.js`, cuyo marcador React lanza una excepción fuera de las
   condiciones de React Server.

Se corrigió el límite arquitectónico con `workspace-roles.ts` como módulo puro
y `runtime-server-only.ts` como guard compatible con Next.js y Netlify
Functions. `check:b5-rollout` ahora construye el worker y rechaza cualquier
dependencia transitiva en `next/headers` o en el marcador React-only. El
contrato de análisis, TypeScript y ESLint aprobaron tras el cambio.

La tercera ejecución física confirmó que el background worker corrigió el
arranque: reclamó el job y registró `attemptCount=1`. El proveedor Groq respondió,
pero su salida no cumplió el contrato de citas y el job cerró de forma segura
como `FAILED/INVALID_ANALYSIS_SCHEMA`; no se persistieron claims, modelo,
tokens ni una evaluación utilizable. No se relajó la validación para forzar un
resultado exitoso.

El fixture se eliminó y el conector Supabase confirmó nuevamente cero usuarios,
workspaces, perfiles, bitácoras, necesidades, dossiers, jobs, tokens y buckets.
El siguiente ciclo B5 debe usar formato JSON Schema estricto con un modelo Groq
compatible, o cambiar a un proveedor compatible, y repetir el gate antes de
habilitar `TERRAQO_EVIDENCE_ANALYSIS_V1`.

### Cierre fail-closed del candidato B5

Después del gate físico se retiró `GROQ_API_KEY` del Site ID de staging y la API
de Netlify confirmó la configuración final: proveedor `off`, confirmación de
proveedor vacía, `TERRAQO_EVIDENCE_ANALYSIS_V1=false` y cohortes B5 vacías. La
clave quedó ausente, no solamente ocultada.

El árbol limpio se desplegó únicamente en staging como
`6ae4871085b33db63ff45e16`. La URL estable y la URL inmutable respondieron
`200` en `/api/health`; la función efímera respondió `404` y el `POST` a
`/api/v1/analysis-jobs` respondió `404`, confirmando el feature flag cerrado.
La verificación independiente posterior confirmó cero filas en usuarios,
workspaces, perfiles, bitácoras, necesidades, dossiers, jobs de análisis,
tokens de verificación y buckets de uso.

`check:b5-rollout`, el contrato de análisis, typecheck, lint y el build completo
de 100 páginas aprobaron. `.env` y `.env.local` fueron restaurados, no quedaron
archivos hold y el enlace local de Netlify volvió al Site ID productivo sin
realizar un deploy productivo. B5 continúa en HOLD exclusivamente por el
contrato de salida del proveedor; B1–B4 permanecen sin cambios.

## Observación de seguridad del esquema staging

El inventario automatizado de Supabase marcó RLS deshabilitado en las tablas
del esquema `icc`. La comprobación directa mostró que `anon`, `authenticated`,
`authenticator` y `service_role` no tienen `USAGE` sobre el esquema ni permisos
CRUD sobre `icc."User"`; tampoco existe una configuración
`pgrst.db_schemas` que exponga `icc`. Por ello no se observó acceso público
actual mediante Supabase Data API.

Se conserva como deuda de defensa en profundidad: antes de conceder `USAGE`,
añadir `icc` a PostgREST o usar clientes Supabase sobre este esquema, deben
definirse políticas RLS explícitas y probarse con roles públicos. No se aplicó
DDL ni se cambiaron grants durante este ciclo.

## Preparación del siguiente gate de proveedor B5

La documentación oficial de Groq confirma que `openai/gpt-oss-20b` admite
Structured Outputs con `response_format.type=json_schema` y `strict=true`.
El modo anterior `json_object` garantizaba únicamente JSON sintácticamente
válido y explica que una respuesta pudiera fallar después en el contrato Zod.

- La solicitud Groq ahora envía el schema exacto de Terraqo con constrained
  decoding estricto y un nombre de contrato estable.
- Zod, el alcance de `sourceId/revisionId` y la coincidencia literal del
  extracto permanecen como barreras semánticas posteriores; el proveedor no
  puede convertir una declaración en capacidad confirmada.
- Un rechazo HTTP `400/422` del contrato se clasifica sin reintentos como
  `PROVIDER_CONTRACT_REJECTED`; rate limits y errores `5xx` conservan la
  política acotada de reintentos.
- El preflight B5 impide regresar accidentalmente a `json_object` y el test de
  contrato fija `json_schema`, `strict=true` y el schema compartido.

Referencias verificadas el 30 de octubre de 2026:

- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/model/openai/gpt-oss-20b

Esta preparación no invocó al proveedor, no reinstaló la credencial y no
cambió las banderas remotas. El próximo gate físico debe volver a crear un
fixture aislado, ejecutar una sola prueba y limpiar antes de considerar B5.
