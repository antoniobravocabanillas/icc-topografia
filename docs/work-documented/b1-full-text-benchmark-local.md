# B1 - Benchmark local de búsqueda full-text

Fecha: 16 de octubre de 2026 (America/Lima).

## Alcance

- PostgreSQL 18 en un clúster temporal aislado.
- Base exclusiva `terraqo_benchmark`, sin datos ni credenciales Terraqo.
- Fixtures sintéticos de 10, 1.000 y 100.000 bitácoras.
- Consultas de una, dos y cuatro palabras con perfil, rango, estado y visibilidad.
- Dos formas por consulta: página cronológica de 21 elementos y conteo autorizado.
- Tres calentamientos y 30 ejecuciones medidas por combinación.
- Presupuesto p95: 500 ms.

## Resultado a 100.000 registros

| Consulta | Forma | p95 ejecución | Plan relevante |
| --- | --- | ---: | --- |
| Una palabra | Página | 0,393 ms | Índice perfil + fecha |
| Una palabra | Conteo | 7,932 ms | Plan elegido por PostgreSQL |
| Dos palabras | Página | 0,298 ms | Índice perfil + fecha |
| Dos palabras | Conteo | 8,959 ms | Plan elegido por PostgreSQL |
| Cuatro palabras | Página | 0,434 ms | Índice perfil + fecha |
| Cuatro palabras | Conteo | 10,739 ms | Índice GIN full-text |

## Dictamen

Gate local aprobado. Todas las páginas devolvieron resultados, ningún p95 superó 500 ms y el índice GIN fue seleccionado cuando la consulta fue suficientemente selectiva. Es correcto que PostgreSQL prefiera el índice compuesto de perfil y fecha para páginas pequeñas ordenadas; forzar el GIN en todos los planes empeoraría la optimización.

El informe completo generado queda en `output/benchmarks/b1-worklog-full-text-2026-10-17T01-27-29-292Z.json`. Este resultado prueba el mecanismo y el script; no sustituye la medición final sobre una copia anonimizada y comparable de staging.
