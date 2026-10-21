# B5 — Evidencia del gate local de base de datos

Fecha: 19 de octubre de 2026.

## Alcance y aislamiento

La validación se ejecutó en PostgreSQL 16 dentro del contenedor disposable `terraqo-b5-staging-gate`, publicado únicamente en `127.0.0.1:55432`. No se usaron credenciales, datos, proveedores ni infraestructura de producción.

La base validada fue `terraqo_b5_migration_gate`. Se reconstruyó desde el esquema del commit HEAD anterior a B1 y se marcaron sus 36 migraciones históricas como aplicadas. Este bootstrap reproduce la precondición real del repositorio: el historial disponible no inicializa Terraqo desde una base vacía.

## Hallazgos corregidos antes del gate final

1. La FK `TerraqoAnalysisJob_createdById_fkey` apuntaba a `public.User`; se corrigió a `icc.User`.
2. La migración full-text usaba `CREATE INDEX CONCURRENTLY`, incompatible con la transacción de `prisma migrate deploy`; se cambió a `CREATE INDEX` y se documentó la ventana de mantenimiento.
3. Las migraciones B1–B5 usaban 138 nombres físicos distintos de los esperados por el datamodel. Se alinearon antes de cualquier rollout externo y se reconstruyó la base desde cero.

## Resultado reproducido

- 42 migraciones activas, 0 incompletas y 0 revertidas.
- Las seis migraciones B1–B5 se aplicaron en orden mediante `prisma migrate deploy`.
- `prisma migrate status`: esquema actualizado.
- `TerraqoWorkCase`, `TerraqoShareCollection`, `TerraqoWorkNeed` y `TerraqoAnalysisJob` existen en `icc`.
- `Worklog_search_vector_gin_idx`: `indisvalid=true` e `indisready=true`.
- Las FKs de `TerraqoAnalysisJob` referencian `icc.User` e `icc.TerraqoEvaluationDossier`.
- El diff DB → datamodel contiene únicamente:
  - `DROP INDEX "Worklog_search_vector_gin_idx";`
  - `ALTER TABLE "TerraqoWorklogEntry" ALTER COLUMN "searchVector" DROP DEFAULT;`

Estas dos sentencias son el drift esperado de la columna generada y su GIN, que Prisma no puede expresar en `schema.prisma`. `npm run check:b5-schema-drift` falla ante cualquier sentencia adicional.

## Recorrido sintético multiusuario

`npm run test:b5-multiuser-gate` se ejecutó sobre la misma base disposable y aprobó:

- workspace profesional admitido en el piloto y workspace de control fuera de la cohorte;
- concesión `ACTIVE` solo para el piloto y rechazo `403` para el control;
- dos solicitudes concurrentes con la misma clave idempotente devuelven un único recurso;
- el límite de dos necesidades produce `429` sin crear una tercera fila;
- retirar el piloto y cancelar el plan cambia la proyección a `PENDING_PILOT`/`FREE` sin borrar historial;
- apagar el flag cambia la capacidad a `DISABLED` y conserva los registros;
- la limpieza final dejó 0 usuarios y 0 workspaces sintéticos.

## Ensayo de backup y restauración

Se generó un `pg_dump` en formato custom desde `terraqo_b5_migration_gate` y se restauró con `pg_restore --exit-on-error` en la base temporal `terraqo_b5_restore_gate`, dentro del mismo contenedor aislado.

La copia restaurada confirmó 42 migraciones activas, 0 incompletas, estado Prisma actualizado, GIN válido/listo, FKs T18 correctas y exactamente los dos artefactos full-text esperados en el gate de drift. Tras registrar la evidencia se eliminaron únicamente la base restaurada y el dump temporal.

El motor de Docker Desktop dejó de responder después del primer ensayo y el puerto histórico `55432` quedó dentro del rango excluido de Windows `55401–55500`. Al recuperar Docker se montó el mismo volumen en un contenedor disposable secundario sobre `127.0.0.1:15432`, se rotó únicamente su credencial local y se repitió el gate. El resultado volvió a ser 42 migraciones activas, 0 incompletas, 0 revertidas y solo los dos artefactos full-text esperados. Después se eliminaron tanto el contenedor de recuperación como `terraqo-b5-staging-gate`; no quedan contenedores B5 ni acciones de limpieza remotas.

## Proveedor Ollama aislado

El primer job sintético detectó que `format: "json"` no bastaba: Qwen devolvió una forma JSON que falló con `INVALID_ANALYSIS_SCHEMA`. Se sustituyó por un JSON Schema estricto con propiedades requeridas, enums, límites y `additionalProperties: false`; el contrato automatizado protege esa estructura.

La repetición con `qwen2.5:7b-instruct` sobre `127.0.0.1:11434` completó un job real T18 en estado `READY`, un solo intento, 385 tokens de entrada, 174 de salida y 45.243 ms de latencia. Las citas atravesaron la validación literal y de scope. La limpieza final confirmó 0 usuarios, 0 workspaces y 0 jobs sintéticos. No se llamó a Groq/OpenAI ni se expuso Ollama fuera de loopback.

## Accesibilidad y recuperación en navegador real

Se creó una segunda base PostgreSQL 16 desechable, `terraqo_b5_browser_gate`, publicada exclusivamente en `127.0.0.1:15433`. `npm run test:b5-browser-accessibility` levantó una compilación Next de producción, autenticó identidades sintéticas mediante Auth.js y verificó las pantallas T13–T17 y T20 contra APIs y SQL reales, tanto en el portal profesional como en el panel empresarial.

El gate aprobó viewport de 320 px y zoom de navegador de 200 %, navegación por teclado con foco visible, ausencia de overflow horizontal, objetivos táctiles críticos y foco automático del motivo obligatorio. En el portal validó la recuperación después de abortar las consultas de solicitudes y colaboraciones. En el panel empresarial abortó las consultas de necesidades y expedientes, recuperó ambas con **Reintentar carga** sin recargar la página y confirmó la visibilidad del plan, del modo de evaluación manual y de las etiquetas de formularios críticos. Las capturas fueron revisadas visualmente después de la ejecución. La limpieza final dejó 0 usuarios, 0 workspaces y 0 bitácoras sintéticas.

## Estado de liberación

Los gates locales de migración, multiusuario, recuperación, accesibilidad de navegador y proveedor Ollama quedan aprobados. B5 continúa en **HOLD** para producción hasta repetir recuperación y rollback en staging, validar lectores de pantalla/dispositivos físicos, observabilidad externa y dispatcher HTTPS. Este documento no autoriza despliegue ni activación de flags.
