# B1 - Estado de implementación

Fecha de corte: 16 de octubre de 2026.

## Implementado

- Permalink canónico de evidencia pública y compatibilidad con enlaces históricos por fragmento.
- Archivo personal consultado en servidor, con límite inicial 20 y máximo 50.
- Cursor opaco estable sobre `occurredAt DESC, id DESC`, ligado por hash a filtros y zona horaria.
- Filtros combinables por texto, tipo, proyecto, estado, día y rango.
- Calendario mensual calculado sin descargar el archivo completo.
- Conversión de límites locales a UTC mediante zona IANA.
- Política central de lectura para titular, miembro autorizado y visitante.
- DTO de lista y detalle por audiencia; la ubicación precisa solo se entrega al titular.
- Contratos versionados:
  - `GET /api/v1/profiles/:profileId/evidence`
  - `GET /api/v1/profiles/:profileId/evidence/activity`
  - `GET /api/v1/evidence/:id`
- Índice Prisma y migración expand-only para `(professionalProfileId, occurredAt DESC, id DESC)`.
- Pruebas de contrato para cursor, rango, zona horaria, permalink y matriz básica de audiencia.
- Explorador público con primera carga acotada y continuación por cursor, con estados accesibles de carga y recuperación.
- Migración expand-only para `tsvector` en español e índice GIN preparada detrás de `TERRAQO_WORKLOG_FTS_V1`.
- Navegación del archivo público validada localmente a 320 px y con teclado; atrás/adelante restaura el registro seleccionado y la posición de scroll por entrada de historial.
- Responsive validado también a 375 × 812 y 812 × 375, sin desbordamiento horizontal, con controles etiquetados y `prefers-reduced-motion: reduce` activo.
- Benchmark reproducible preparado para 10, 1.000 y 100.000 registros, 30 ejecuciones por consulta y verificación automática del índice GIN, siempre en esquema efímero de una base aislada.
- Benchmark local ejecutado en PostgreSQL 18: gate aprobado; a 100.000 registros, p95 máximo de página 0,469 ms y p95 máximo de conteo 10,739 ms. El GIN fue usado en la consulta selectiva y el índice cronológico en páginas pequeñas ordenadas.

## Cierre de implementacion local

La implementacion, sus contratos, pruebas automatizadas, benchmark local y documentacion operativa estan completos. ADR-003 fue aceptado el 16 de octubre de 2026.

El estado de release permanece **HOLD**: cerrar codigo no autoriza alterar una base remota no identificada, desplegar ni habilitar el flag en produccion.

## Gates externos antes del release

- Repetir el benchmark ya validado localmente sobre una copia anonimizada y comparable de staging.
- Aplicar y medir la migración full-text en staging; el fallback `contains` permanece activo mientras el flag esté apagado.
- Probar la ruta autenticada con lector de pantalla real; la ruta pública ya pasó 320 px, teclado, atrás/adelante y restauración de scroll.
- Ejecutar y aprobar el procedimiento de rollout/rollback documentado; el flag ya existe y falla cerrado.

## Gate

B1 queda **cerrado en implementacion local** y **retenido para release** hasta completar los gates externos. No se aplicaron migraciones ni se modifico una base remota.
