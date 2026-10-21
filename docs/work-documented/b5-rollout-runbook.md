# B5 — Runbook de staging, rollout y rollback

Fecha: 18 de octubre de 2026.

## Alcance

B5 integra T18–T20 sobre B1–B4: análisis privado con fuentes, recuperación observable y entitlements de piloto. Este documento no autoriza producción, cobros ni proveedores reales. La evaluación manual debe seguir funcionando con IA apagada.

## Preflight local no mutante

Ejecutar:

```powershell
npm run check:b5-rollout
npm run typecheck
npm run test:evidence-analysis-contract
npm run test:recovery-observability-contract
npm run test:product-entitlements-contract
npm run build
```

`check:b5-rollout` solo lee archivos del repositorio. Comprueba orden de migraciones, esquema de claves foráneas, flags seguros, ausencia de memoria personalizada de Netlify y configuración cerrada por defecto. No abre `DATABASE_URL`, no migra y no llama proveedores.

Después de aplicar las migraciones en una base aislada, ejecutar el gate de drift de solo lectura:

```powershell
$env:B5_GATE_DATABASE_URL = "postgresql://.../terraqo_b5_migration_gate?schema=icc"
$env:B5_GATE_EXPECTED_DATABASE = "terraqo_b5_migration_gate"
npm run check:b5-schema-drift
```

El comando no imprime la URL ni modifica la base. En un host remoto exige además `B5_GATE_ALLOW_REMOTE_READONLY=true`. Solo acepta dos diferencias conocidas: el índice GIN `Worklog_search_vector_gin_idx` y la expresión generada de `searchVector`, ambos creados con SQL porque Prisma no los representa en el datamodel. Cualquier otra sentencia bloquea el rollout.

En una base disposable local se puede ejecutar además el recorrido sintético multiusuario:

```powershell
npm run test:b5-multiuser-gate
```

Reutiliza `B5_GATE_DATABASE_URL` y `B5_GATE_EXPECTED_DATABASE`, rechaza hosts remotos y exige que el nombre declare `gate`, `test`, `staging` o `disposable`. Crea dos usuarios y dos workspaces sintéticos, valida piloto/control, replay concurrente, límite, downgrade y flags, y elimina sus fixtures en `finally`.

Con Ollama activo exclusivamente en loopback y el modelo local instalado:

```powershell
npm run test:b5-ollama-provider-gate
```

Este gate mutante rechaza tanto PostgreSQL como Ollama remotos. Crea un expediente y una fuente pública completamente sintéticos, procesa un job real con el worker de dominio, exige contrato/citas válidas y limpia todos los fixtures. No sustituye la prueba del dispatcher HTTPS ni autoriza exponer el puerto 11434.

## Precondiciones externas

Antes de abrir una conexion, cargar las variables del entorno aislado en el
terminal controlado y ejecutar:

```powershell
$env:PLATFORM_STAGING_CONFIRM = "staging"
$env:PLATFORM_STAGING_ALLOW_REMOTE = "true"
npm run check:platform-staging
```

El preflight no conecta a la base. Falla si el nombre no declara
staging/gate/test, si la URL publica corresponde a produccion, si un flag esta
activo, si la cohorte no esta vacia o si los secretos operativos son debiles o
reutilizados. No imprime usuarios, contrasenas ni URLs completas.

1. Identificar por escrito una base de staging aislada y confirmar host, base y propietario. No aceptar una URL ambigua, alias de producción ni rama Accelerate compartida.
2. Tomar respaldo recuperable y ejecutar una restauración de prueba antes de la ventana.
3. Mantener todos los flags B1–B5 en `false`, proveedor en `off` y allowlist del piloto vacía.
4. Aplicar migraciones en el orden validado por el preflight; no usar `db push`, `migrate reset` ni DDL manual.
5. Crear dos workspaces de prueba y dos identidades profesionales sin documentos reales.
6. Elegir un proveedor aislado. Si se usa Ollama, exponerlo solo por HTTPS autenticado desde el worker; nunca publicar el puerto 11434 directamente.
7. Generar `EVIDENCE_ANALYSIS_DISPATCH_SECRET` independiente y almacenarlo únicamente en el gestor de variables del entorno.

## Orden de migración

1. `20261016113000_worklog_archive_cursor_index`
2. `20261016143000_worklog_full_text_search`
3. `20261016183000_worklog_revisions_work_cases`
4. `20261017120000_scoped_sharing_endorsements`
5. `20261017230000_discovery_needs`
6. `20261018153000_evidence_analysis_jobs`
7. `20261020143000_share_item_media_snapshot`

Después de cada migración, registrar nombre, checksum, hora, operador y resultado. Detener ante una FK, índice o conteo inesperado; no marcar manualmente la migración como aplicada. La séptima migración congela en `mediaIds` los archivos ya autorizados por cada selección; comprobar que el conteo no crezca después de adjuntar un medio nuevo al worklog.

El historial versionado presupone el esquema Terraqo anterior a B1; no es una migración inicial para bases vacías. Restaurar una copia de ese baseline antes de `migrate deploy`. La migración full-text crea un GIN de forma transaccional y requiere ventana de mantenimiento; `CREATE INDEX CONCURRENTLY` no es compatible con la transacción de Prisma usada por este proyecto.

Los nombres físicos de índices y claves foráneas de B1–B5 están alineados con el datamodel. No aceptar renombrados masivos como drift inocuo: reconstruir la base aislada y exigir que el gate anterior vuelva a reportar únicamente los dos artefactos full-text.

## Cohortes y activación

1. Activar B1/B2 y comprobar archivo, permalink, cursor, calendario, revisión y WorkCase.
2. Activar B3 y comprobar selección, concesión, revocación y respaldo entre identidades separadas.
3. Activar `TERRAQO_DISCOVERY_NEEDS_V1` únicamente para el workspace piloto; confirmar aislamiento y evaluación manual.
4. Activar mensajería contextual, colaboración y cierre en ese orden. Cada paso exige su contrato y recorrido multiusuario aprobado.
5. Configurar proveedor y dispatcher, manteniendo `TERRAQO_EVIDENCE_ANALYSIS_V1=false`.
6. Añadir solo el workspace piloto a `TERRAQO_B5_PILOT_WORKSPACE_IDS`; nunca usar `*` en la primera cohorte.
7. Activar análisis y verificar citas, abstención, cancelación, retry, límite y revocación de fuente.
8. Ampliar la cohorte solo después de observar una ventana completa sin fugas, backlog creciente ni errores no clasificados.

## Matriz mínima de aceptación

| Caso | Resultado obligatorio |
|---|---|
| Workspace fuera del piloto | Puede consultar historial; toda escritura comercial nueva falla cerrada. |
| Workspace piloto | Escribe dentro del límite y recibe `429` con `Retry-After` al agotarlo. |
| Replay idempotente | Devuelve el mismo recurso y no consume otra unidad. |
| Dos requests concurrentes | Solo una operación efectiva; no exceden el límite por carrera. |
| Proveedor apagado | No aparece el botón de análisis; evaluación manual disponible. |
| Worker no configurado | No se presenta como disponible; no quedan claims parciales. |
| Fuente revocada durante análisis | Job `SOURCE_REVOKED`, claims ocultos y dossier recuperable manualmente. |
| Otro workspace o profesional | Respuesta neutral sin dossier, notas, fuente, nombre ni medio. |
| Cierre aceptado | Constancia privada; no publica ni concede adjuntos. |
| Retiro del piloto/downgrade | Historial legible y decisiones profesionales pendientes resolubles. |

## Observación

Alertar por código estable y `requestId`, nunca por contenido. Medir backlog `QUEUED/RETRY_WAIT`, jobs agotados, citas inválidas, revocaciones, latencia, tokens y costo estimado. No registrar prompts, salidas, nombres, ubicación, documentos ni mensajes.

## Rollback

1. Apagar `TERRAQO_EVIDENCE_ANALYSIS_V1`.
2. Retirar la cohorte de `TERRAQO_B5_PILOT_WORKSPACE_IDS` si debe bloquearse nueva escritura.
3. Apagar cierre, colaboración, mensajería y discovery en orden inverso.
4. Conservar tablas, revisiones, jobs, decisiones, constancias e idempotency keys.
5. No borrar migraciones ni recalificar estados históricos.
6. Restaurar una base solo ante corrupción confirmada y mediante el respaldo ensayado.

## Evidencia requerida para liberar

- salida de preflight y contratos;
- registro de migraciones y checksums;
- matriz actor × workspace × recurso;
- capturas/red de estados adversos sin datos reales;
- resultados de teclado, lector de pantalla, 320 px y zoom 200 %;
- métricas de la cohorte y ensayo documentado de rollback;
- aprobación de producto, seguridad, operación y responsable técnico.

B5 permanece en **HOLD** hasta completar estos gates en staging. El build local no sustituye el recorrido aislado ni autoriza producción.

El ensayo local de migración, fixtures multiusuario y restauración está registrado en `docs/work-documented/b5-local-database-gate.md`; debe repetirse contra infraestructura de staging identificada antes de retirar el HOLD.
