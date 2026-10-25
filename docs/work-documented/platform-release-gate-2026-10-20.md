# Gate de plataforma B1-B5 - corte 20 de octubre de 2026

## Dictamen

La implementacion local de B1-B5 esta disponible y los gates locales no mutantes
estan aprobados. La revision de seguridad post-remediacion quedo sellada con
cero hallazgos reportables en el snapshot revisado. La liberacion continua en
**HOLD** por dos causas independientes:

1. El arbol de trabajo sigue siendo mutable y mezcla cambios de producto,
   pruebas, documentacion y artefactos locales. El scan sellado conserva el
   digest exacto revisado, pero no reemplaza un candidato Git inmutable.
2. El destino Supabase exclusivo de staging ya esta migrado, sin drift no
   documentado y con runtime sin DDL. La revision candidata fue desplegada con
   flags apagados y aprobo el smoke E2E anonimo; faltan el recorrido
   multiusuario B1-B5, rollback, observabilidad externa y accesibilidad sobre
   dispositivos fisicos.

Este documento prepara la liberacion, pero no autoriza aplicar migraciones,
activar flags, desplegar, ejecutar cobros ni usar datos de clientes.

## Destino de staging reservado

- Proveedor: Supabase, proyecto administrado independiente.
- Organizacion: `Vrilla SAC`.
- Nombre confirmado: `Terraqo Platform Staging`.
- Project ref: `mghdpciewbsowjrjwmwk`.
- Region: Sao Paulo (`sa-east-1`).
- Base administrada: `postgres`, PostgreSQL 17.11.
- Estado comprobado: `ACTIVE_HEALTHY`, ledger Prisma `43:43:0`, sin tablas en
  `public` y sin filas de aplicacion en `icc`.
- Coste cotizado al crear: USD 0 mensual.
- Advisors iniciales de seguridad y rendimiento: sin avisos.

La identidad no secreta y las comprobaciones realizadas se registran en
`docs/work-documented/platform-staging-target-2026-10-21.md`. No se guardaron
credenciales ni datos reales; el DDL se limito al baseline y las migraciones
versionadas B1-B5 del candidato.

## Estado del candidato

- Repositorio: `icc-topografia`.
- Rama: `codex/icc-production-preview`.
- Commit base observado: `e6ff153`.
- Arbol de trabajo: no inmutable; 166 entradas candidatas modificadas o sin
  seguimiento despues de excluir artefactos locales generados.
- Consecuencia: no se puede asociar de forma reproducible una migracion o un
  despliegue con una revision Git hasta revisar, separar y registrar estos
  cambios.
- Inventario regenerado: 423 archivos TS/TSX, 275 rutas y 1.142 controles.

Los cambios existentes pertenecen al trabajo en curso. El usuario confirmo el
21 de octubre de 2026 que las 166 entradas visibles forman un unico candidato
B1-B5. No deben limpiarse ni restaurarse; solo se excluyen los artefactos locales
identificados por el gate de higiene.

## Revision de seguridad del candidato

- Scan inicial: `10552a4a-25fd-47a5-82b5-86e420344695`.
- Base: `e6ff153694dc01ab8a2b5848556fa6839626b2af`.
- Alcance: 247 archivos modificados o no rastreados del working tree.
- Resultado: 12 hallazgos validados; 8 de severidad media y 4 de severidad baja.
- Artefactos sellados: `report.md`, `findings.json`, `coverage.json`,
  `threatmodel.md` y exportacion SARIF en el directorio persistente del scan.
- Limitacion: revision estatica y offline; no se contacto staging, produccion,
  proveedores ni datos reales.

Verificacion post-remediacion sellada:

- Scan: `d56c041f-645f-46ee-8201-e6e08ebce851`.
- Snapshot:
  `codex-security-snapshot/v1:sha256:8257d1aff3e1cd233e1d358cf48309c4c2e58b458a8672ed4332be07a932402c`.
- Alcance: 249 de 249 elementos del diff revisados.
- Resultado: cero hallazgos reportables; los 12 hallazgos iniciales fueron
  revaluados contra las correcciones y ADR-007.
- Cobertura: completa sobre el diff congelado y parcial sobre el entorno, porque
  no se contacto staging, base de datos desplegada, proxy ni proveedores.
- Advertencia del sello: el working tree cambio respecto del snapshot durante
  la ejecucion; el informe es valido solo para el digest anterior. Por eso la
  revision debera repetirse sobre el futuro commit candidato.
- Informe sellado:
  `C:\Users\Binv\.codex\state\plugins\codex-security\scans\icc-topografia\e6ff153694dc01ab8a2b5848556fa6839626b2af_20261021T044847Z_rxmruakc\report.md`.

Orden de remediacion propuesto:

1. Aislamiento tenant e idempotencia: vincular los replays de necesidades,
   expedientes y cierres al workspace y al recurso original.
2. Proyeccion de evidencia: no publicar notas de validacion no aprobadas ni
   metadatos de bitacoras privadas enlazadas.
3. Selecciones: fijar `allowedFields` y los IDs exactos de medios en un snapshot
   inmutable para proyecciones publicas y grants privados.
4. Mensajeria: exigir membresia activa para conversaciones de workspace aunque
   el participante historico conserve `leftAt = null`.
5. Entitlements: aplicar la politica de piloto al reintento IA y decidir de
   forma explicita si las decisiones profesionales en curso se bloquean o quedan
   grandfathered al retirar una cohorte.

Estado local de remediacion al 21 de octubre de 2026:

- Replays de necesidad, expediente y cierre vinculados a workspace y recurso.
- Proyeccion publica limitada a validaciones aprobadas y sin continuidad
  privada.
- Discovery aplica `allowedFields` al matching y a la respuesta.
- Conversaciones de workspace exigen membresia activa.
- Reintento de analisis exige entitlement vigente.
- Selecciones congelan los IDs exactos de medios mediante
  `20261020143000_share_item_media_snapshot`.
- Las decisiones profesionales pendientes conservan la excepcion terminal
  documentada en ADR-007.

La seguridad del snapshot ya no bloquea la preparacion del candidato. No se debe
iniciar staging hasta crear y volver a validar una revision Git inmutable y
registrar la aprobacion producto/seguridad de ADR-007.

## Inventario B1-B5

| Bloque | Alcance local | Migracion | Flags principales | Gate local | Pendiente externo |
| --- | --- | --- | --- | --- | --- |
| B1 | Archivo escalable, permalink, DTO por audiencia, cursor, calendario y full-text | `20261016113000_worklog_archive_cursor_index`, `20261016143000_worklog_full_text_search` | `TERRAQO_WORKLOG_FTS_V1` | Cerrado; benchmark local hasta 100.000 registros | Copia anonimizada comparable, benchmark de staging, ruta autenticada y lector de pantalla real |
| B2 | Medios seguros, borrador recuperable, revisiones, contribucion y WorkCase | `20261016183000_worklog_revisions_work_cases` | `TERRAQO_WORK_CASES_V1` | Cerrado | Migracion, recorrido manual de carga/reintento/conflicto y rollback con flags |
| B3 | Selecciones, grants, proyeccion revocable, snapshot de medios y respaldo acotado | `20261017120000_scoped_sharing_endorsements`, `20261020143000_share_item_media_snapshot` | `TERRAQO_SCOPED_SHARING_V1`, `TERRAQO_SCOPED_ENDORSEMENTS_V1` | Cerrado | Dos identidades y dos workspaces; revocacion de lectura, medio y respaldo |
| B4 | Necesidad, dossier, mensajeria contextual, colaboracion y cierre | `20261017230000_discovery_needs` | `TERRAQO_DISCOVERY_NEEDS_V1`, `TERRAQO_CONTEXTUAL_MESSAGING_V1`, `TERRAQO_COLLABORATION_V1`, `TERRAQO_CLOSURE_V1` | Cerrado; navegador real local a 320 px y zoom 200 % | Recorrido de dos partes en staging, aislamiento, concurrencia, sustitucion de versiones y constancia privada |
| B5 | Analisis con fuentes, recuperacion/observabilidad y piloto por entitlement | `20261018153000_evidence_analysis_jobs` | `TERRAQO_EVIDENCE_ANALYSIS_V1`, `TERRAQO_B5_PILOT_WORKSPACE_IDS` | Cerrado localmente; DB disposable, Ollama local, multiusuario y browser gate documentados | Dispatcher HTTPS, observabilidad externa, cohorte de staging, limites definitivos y rollback observado |

## Orden obligatorio de migracion

1. `20261016113000_worklog_archive_cursor_index`
2. `20261016143000_worklog_full_text_search`
3. `20261016183000_worklog_revisions_work_cases`
4. `20261017120000_scoped_sharing_endorsements`
5. `20261017230000_discovery_needs`
6. `20261018153000_evidence_analysis_jobs`
7. `20261020143000_share_item_media_snapshot`

Reglas:

- El destino debe ser una copia aislada e identificada de staging; no una URL
  ambigua, produccion ni una rama Accelerate compartida.
- El baseline anterior a B1 debe existir. Este historial no inicializa Terraqo
  desde una base vacia.
- En una base vacia, aplicar el baseline pre-B1 checksummed y registrar sus 36
  migraciones historicas con `prisma migrate resolve --applied`; no insertar
  manualmente en `_prisma_migrations`.
- Aplicar las siete migraciones B1-B5 solo con `prisma migrate deploy`; no
  resolverlas, usar `db push` ni `migrate reset`.
- Registrar por migracion: nombre, checksum, hora, operador, duracion y
  resultado.
- Detener ante cualquier FK, indice, conteo o drift inesperado.
- La construccion GIN es transaccional y necesita ventana de mantenimiento.
- El rollback operativo inicial apaga flags; no elimina tablas ni reescribe
  estados historicos.

## Variables y secretos

### Configuracion base que debe existir en staging

- Conexion y autenticacion: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`.
- Confirmacion operativa previa: `PLATFORM_STAGING_CONFIRM=staging` y, para un
  host remoto identificado, `PLATFORM_STAGING_ALLOW_REMOTE=true`.
- Para un proyecto Supabase dedicado: `PLATFORM_STAGING_DATABASE_PROVIDER=supabase`,
  `PLATFORM_STAGING_RESOURCE_NAME` con el nombre de staging confirmado y
  `PLATFORM_STAGING_SUPABASE_PROJECT_REF` con la referencia exacta. La base
  administrada se llama `postgres`; el preflight valida el aislamiento mediante
  la referencia incluida en el host directo o en el usuario del pooler y rechaza
  cualquier discrepancia antes de abrir una conexion.
- URLs publicas/canonicas: `NEXT_PUBLIC_SITE_URL` y las URLs Terraqo que use el
  entorno segun `.env.example`.
- Almacenamiento y correo: credenciales del proveedor de blobs, `RESEND_API_KEY`,
  `TERRAQO_EMAIL_FROM` y reply-to configurado por operacion.
- OAuth solo si se certifica en ese entorno: IDs/secretos Google, Apple o
  Microsoft correspondientes a callbacks de staging.

### Flags B1-B5

Mantener inicialmente en `false`:

- `TERRAQO_WORKLOG_FTS_V1`
- `TERRAQO_WORK_CASES_V1`
- `TERRAQO_SCOPED_SHARING_V1`
- `TERRAQO_SCOPED_ENDORSEMENTS_V1`
- `TERRAQO_DISCOVERY_NEEDS_V1`
- `TERRAQO_CONTEXTUAL_MESSAGING_V1`
- `TERRAQO_COLLABORATION_V1`
- `TERRAQO_CLOSURE_V1`
- `TERRAQO_EVIDENCE_ANALYSIS_V1`

Mantener inicialmente vacio:

- `TERRAQO_B5_PILOT_WORKSPACE_IDS`

Mantener inicialmente apagado:

- `TERRAQO_EVIDENCE_ANALYSIS_PROVIDER=off`

### Analisis T18

- `EVIDENCE_ANALYSIS_DISPATCH_SECRET`: secreto exclusivo de staging, generado y
  guardado en el gestor del entorno.
- Proveedor/modelo: configurar solo uno de los proveedores admitidos y sus
  variables de modelo.
- Aplicar limites de input, output, timeout, intentos, cuota diaria y mensual
  mediante las variables `TERRAQO_EVIDENCE_ANALYSIS_*` documentadas.
- Ollama no debe exponerse directamente por el puerto `11434`; el worker requiere
  un endpoint HTTPS autenticado.

### Variables de operador, no persistentes en el despliegue

- `B5_GATE_DATABASE_URL`, `B5_GATE_EXPECTED_DATABASE` y, solo para lectura
  remota confirmada, `B5_GATE_ALLOW_REMOTE_READONLY`.
- `PLATFORM_STAGING_CONFIRM` y `PLATFORM_STAGING_ALLOW_REMOTE`; ejecutar
  `npm run check:platform-staging` antes de cualquier conexion.
- En Supabase, `B5_GATE_EXPECTED_DATABASE=postgres` solo es valido junto con el
  proveedor, nombre de recurso y project ref confirmados. No reutilizar el
  proyecto `Terraqo` ni inferir que un proyecto inactivo equivale a staging.
- `B1_BENCHMARK_DATABASE_URL`, `B1_BENCHMARK_CONFIRM_DATABASE` y el opt-in
  remoto del benchmark.

Estas variables pertenecen al terminal controlado del gate. No deben copiarse
como secretos permanentes de la aplicacion ni imprimirse en logs.

## Gate ejecutado en este corte

| Comprobacion | Resultado |
| --- | --- |
| `npm run check:b5-rollout` | Aprobado; solo lectura, sin DB ni proveedor |
| `npm run check:platform-staging` | Preparado; fail-closed y pendiente de variables reales de staging |
| `npm run test:terraqo-local-contracts` | Aprobado; 32 contratos no mutantes, incluidas higiene del candidato y politica de staging |
| `npm run typecheck` | Aprobado |
| `npm run lint` | Aprobado sin warnings |
| `npm run build` | Aprobado; 99 paginas estaticas generadas y rutas B1-B5 incluidas |
| `npm run check:encoding` | Aprobado |
| `npm run audit:inventory` | Aprobado; inventario regenerado |
| `git diff --check` | Aprobado; solo avisos de conversion LF/CRLF |
| `npm audit --omit=dev --audit-level=moderate` | Aprobado para el umbral; cuatro avisos bajos WebAuthn/Auth.js |

La correccion automatica de los avisos WebAuthn propone versiones mayores. Debe
tratarse como una fase separada con registro, autenticacion, RP ID, dispositivos
existentes y recuperacion de acceso; no ejecutar `npm audit fix --force` durante
este release.

## Recorridos E2E requeridos en staging

### Identidades y aislamiento

1. Crear dos usuarios profesionales sinteticos y dos workspaces de staging.
2. Validar titular, administrador, evaluador, revisor y usuario ajeno.
3. Ejecutar matriz actor x workspace x recurso para lista, detalle, medio, grant,
   dossier, mensaje, colaboracion, cierre y job.
4. Toda lectura ajena debe fallar de forma neutral, sin filtrar titulo, nombre,
   ubicacion, medio, notas o existencia.

### B1-B3

1. Abrir enlaces legacy y canonicos, incluido un registro fuera de la primera
   pagina.
2. Combinar cursor, busqueda, calendario, zona horaria y retorno con scroll.
3. Interrumpir/reintentar adjuntos y verificar que no se dupliquen.
4. Editar un publicado y comprobar revision inmutable.
5. Crear WorkCase solo por confirmacion explicita.
6. Compartir una seleccion, revocar el grant y comprobar lectura/medios/cache.
7. Confirmar parcialmente un respaldo; revocar autoridad y comprobar el alcance.

### B4-B5

1. Empresa crea necesidad y obtiene resultados explicables sin score personal.
2. Dossier y notas permanecen privados al workspace.
3. Referenciar evidencia en un mensaje no concede acceso al archivo.
4. Cambiar alcance crea propuesta nueva; una version sustituida no se acepta.
5. Aceptar cierre crea constancia privada y no publica adjuntos.
6. Replay y dos requests concurrentes producen una sola operacion efectiva.
7. Proveedor apagado conserva evaluacion manual.
8. Fuente revocada durante analisis termina `SOURCE_REVOKED` y oculta claims.
9. Limite agotado devuelve `429` y `Retry-After` sin carreras.
10. Retirar piloto conserva historial y decisiones profesionales pendientes.

### UX, recuperacion y operacion

- 320 px, tablet, desktop y zoom 200 % sin overflow.
- Teclado completo, foco visible/retornado y lector de pantalla real.
- Teclado movil visible en dispositivo fisico sin tapar acciones.
- Perdida de red, sesion vencida, 409, 429, archivo rechazado, fuente retirada y
  proveedor IA no disponible sin perder borradores.
- Dispatcher HTTPS real de staging y alerta por backlog, agotamiento, citas
  invalidas, revocaciones y errores, sin contenido privado en logs.

## Secuencia de preparacion y despliegue

### Fase A - candidato reproducible

1. Revisar las 166 entradas candidatas y separar producto, pruebas,
   documentacion y
   artefactos temporales sin descartar trabajo ajeno.
2. Conservar la evidencia de remediacion de los 12 hallazgos y ADR-007 dentro
   del candidato.
3. Excluir del candidato `.playwright-cli/`, salidas de `output/playwright/` y
   benchmarks generados; conservarlos fuera del commit como evidencia local.
4. Crear una revision Git identificable y registrar su SHA; no desplegar desde un
   arbol sucio.
5. Ejecutar nuevamente el gate local completo y un diff scan sobre esa revision.

### Fase B - staging aislado

1. [Completado] Registrar host, nombre de DB, propietario y confirmacion de no
   produccion.
2. [Completado] Baseline pre-B1 sin filas y ensayo desechable aprobados: ledger
   43:43:0, objetos B1-B5, GIN, cero filas, drift esperado y limpieza.
3. Configurar variables con todos los flags apagados, proveedor `off` y cohorte
   vacia. [Completado] El sitio Netlify aislado tiene variables no secretas,
   secretos Auth/dispatcher, kill switches OAuth/correo y conexion runtime DML
   sin DDL verificada. Todavia no existe despliegue.
4. [Completado] Aplicar baseline, resolver 36 migraciones historicas y desplegar
   las siete migraciones B1-B5 en orden.
5. [Completado] `npm run check:b5-schema-drift`: solo los dos artefactos
   full-text documentados.
6. [Completado] Desplegar exactamente la revision candidata con flags apagados.
   Revision vigente `4313f2d`, deploy `6add4e394d17c7cb1c4722b6` en el sitio
   aislado. El deploy inicial `6add4b1827c97b3b16ae86a4` queda como evidencia
   anterior al endurecimiento del replay concurrente.
7. [Parcial] Smoke E2E anonimo aprobado: salud, home, cuenta, red vacia,
   aislamiento de enlaces, OAuth apagado, contratos 401/404 y evidencia visual
   desktop/movil. El gate B5 directo sobre PostgreSQL remoto aprobo dos
   identidades/workspaces, piloto/control, replay concurrente, limite,
   downgrade, flags y limpieza total. Pendiente la matriz HTTP autenticada
   B1-B5, request IDs, rollback y observabilidad.

### Fase C - activacion por cohortes

1. B1/B2.
2. B3.
3. Discovery y evaluacion manual B4.
4. Mensajeria, colaboracion y cierre, en ese orden.
5. Configurar dispatcher/proveedor manteniendo analisis apagado.
6. Admitir un unico workspace piloto; nunca `*` en la primera cohorte.
7. Activar analisis y observar una ventana completa.

### Fase D - decision de produccion

Producto, seguridad, operacion y responsable tecnico deben revisar la evidencia
de staging, el rollback y los riesgos residuales. Solo una autorizacion explicita
posterior permite preparar produccion.

## Condiciones de salida del HOLD

- Candidato Git inmutable y revisado.
- Cero hallazgos medios abiertos en el diff scan; hallazgos bajos resueltos o
  aceptados formalmente con responsable y vencimiento.
- Staging identificado, respaldado y restaurable.
- Siete migraciones aplicadas sin drift no documentado.
- E2E B1-B5 aprobado con dos identidades y dos workspaces.
- Accesibilidad real y dispositivos fisicos aprobados.
- Observabilidad y dispatcher HTTPS comprobados.
- Rollback por flags ensayado y documentado.
- Cohorte y limites comerciales aprobados.
- Firmas de producto, seguridad, operacion y responsable tecnico.
