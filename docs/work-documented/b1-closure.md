# B1 - Acta de cierre de implementacion

Fecha: 16 de octubre de 2026.

## Resultado

La implementacion local de B1 queda cerrada. Se completaron el archivo escalable, los permalinks compatibles, la politica de acceso, los DTO por audiencia, la paginacion por cursor, el calendario por zona, la busqueda full-text protegida por flag y la navegacion accesible del CV publico.

ADR-003 esta aceptado. El estado de entrega es:

- **Implementacion local:** COMPLETA.
- **Validacion automatizada:** COMPLETA.
- **Benchmark PostgreSQL local:** APROBADO.
- **Release a staging/produccion:** HOLD.

## Evidencia de calidad

- `npm run typecheck`: aprobado.
- `npm run test:public-cv-permalink`: aprobado.
- `npm run test:worklog-archive`: aprobado.
- `npm run test:evidence-policy`: aprobado.
- ESLint focalizado: aprobado.
- `npm run check:encoding`: aprobado.
- `npm run audit:inventory`: aprobado.
- `npm run build`: aprobado.
- Responsive a 320 px, 375 x 812 y 812 x 375: sin desbordamiento horizontal.
- Teclado, foco, etiquetas, reduced motion, atras/adelante y restauracion de scroll: aprobados localmente.
- Benchmark de 10, 1.000 y 100.000 registros: aprobado con presupuesto p95 de 500 ms.
- En 100.000 registros: p95 maximo de pagina 0,469 ms y p95 maximo de conteo 10,739 ms.

Informe del benchmark:

`output/benchmarks/b1-worklog-full-text-2026-10-17T01-27-29-292Z.json`

## Gates externos obligatorios

1. Proveer una base de staging anonimizada y claramente identificada.
2. Aplicar alli las migraciones expand-only de cursor y full-text.
3. Repetir el benchmark con volumen comparable y adjuntar p50, p95, p99, planes y buffers.
4. Probar la ruta autenticada con una cuenta de prueba.
5. Completar una pasada manual con lector de pantalla real.
6. Habilitar `TERRAQO_WORKLOG_FTS_V1` primero en staging y ejecutar el runbook.

## Controles de seguridad aplicados

- El benchmark nunca reutiliza `DATABASE_URL`.
- Una base remota exige opt-in explicito y confirmacion exacta del nombre.
- No se aplicaron migraciones a la URL local existente porque no esta identificada como staging.
- El flag permanece apagado y el fallback actual continua disponible.
- Las migraciones son expand-only; el rollback operativo consiste en apagar el flag, sin destruir columna ni indice.

## Decision de entrega

No queda trabajo local seguro pendiente dentro de B1. Lo restante requiere infraestructura o validacion humana externa y no debe sustituirse con una simulacion ni ejecutarse contra una base ambigua.
