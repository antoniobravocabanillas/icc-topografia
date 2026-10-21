# B1 - Runbook de rollout y rollback

Fecha: 16 de octubre de 2026.

## Precondiciones

1. Mantener `TERRAQO_WORKLOG_FTS_V1=false` en todos los entornos.
2. Restaurar una copia anonimizada de staging con volúmenes de 10, 1.000 y 100.000 bitácoras.
3. Aplicar las migraciones de cursor y búsqueda full-text fuera del flujo de atención al usuario. La columna generada y el índice GIN se crean dentro de la transacción de Prisma sin `CONCURRENTLY`; reservar una ventana porque PostgreSQL puede bloquear escrituras mientras construye el índice.
4. Confirmar que `icc."TerraqoWorklogEntry"."searchVector"` está poblado y que `Worklog_search_vector_gin_idx` es válido.

## Medición obligatoria

Ejecutar `EXPLAIN (ANALYZE, BUFFERS)` para búsquedas de una, dos y cuatro palabras, combinadas con perfil, fecha, estado y visibilidad. Guardar:

- tiempo total y tiempo de planificación;
- filas leídas frente a filas devueltas;
- uso del índice GIN;
- buffers compartidos leídos y encontrados;
- p50, p95 y p99 de al menos 30 ejecuciones por volumen.

No habilitar el flag si p95 supera el presupuesto acordado, alguna consulta representativa no devuelve resultados o PostgreSQL nunca usa el GIN en 100.000 registros. No exigir el GIN en cada plan: para consultas comunes con `LIMIT` y orden cronológico, el optimizador puede elegir correctamente el índice compuesto de perfil y fecha.

### Ejecución reproducible y aislada

El repositorio incluye `npm run benchmark:worklog-fts`. El benchmark nunca reutiliza `DATABASE_URL`: exige una URL independiente, confirmación exacta de la base y crea un esquema efímero propio. No toca tablas de aplicación ni inserta fixtures en producción.

```powershell
$env:B1_BENCHMARK_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/terraqo_benchmark"
$env:B1_BENCHMARK_CONFIRM_DATABASE = "terraqo_benchmark"
npm run benchmark:worklog-fts
```

Para una copia remota y anonimizada de staging también se exige `B1_BENCHMARK_ALLOW_REMOTE=true`. El script ejecuta 3 calentamientos y al menos 30 mediciones por consulta y volumen, comprueba resultados, presupuesto p95 y uso selectivo del GIN en 100.000 registros, elimina su esquema al terminar y deja el informe JSON en `output/benchmarks/`. El presupuesto predeterminado es 500 ms y puede ajustarse con `B1_BENCHMARK_P95_BUDGET_MS`. Solo usar `B1_BENCHMARK_KEEP_SCHEMA=true` durante una investigación controlada.

## Activación gradual

1. Habilitar `TERRAQO_WORKLOG_FTS_V1=true` únicamente en staging.
2. Verificar propietario, miembro autorizado y visitante público con las mismas consultas.
3. Confirmar que un cambio de visibilidad a privado se respeta durante la hidratación del resultado.
4. Activar en producción durante una ventana observada y revisar errores, latencia y consultas sin resultados.

## Rollback

1. Cambiar `TERRAQO_WORKLOG_FTS_V1=false` y volver a desplegar la configuración.
2. Verificar que la búsqueda usa el fallback Prisma `contains` y que listado, calendario y cursores continúan operativos.
3. No eliminar inmediatamente columna ni índice: son cambios expand-only y no afectan las escrituras existentes.
4. Abrir incidencia con consulta, audiencia, filtros, cursor anonimizado y trazas de base de datos. Nunca registrar títulos, resúmenes ni coordenadas en logs.

## Criterio de cierre

La implementacion local puede cerrarse al aprobar ADR-003, superar las pruebas automatizadas y adjuntar el benchmark local reproducible. El release solo puede autorizarse despues de adjuntar las mediciones de staging y completar pruebas reales de lector de pantalla y de la ruta autenticada. Las pruebas de teclado, 320 px, navegacion atras/adelante y restauracion de scroll ya fueron completadas localmente.
