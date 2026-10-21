# ADR-002 - Separar visibilidad, concesion, respaldo y procesamiento

- Estado: propuesto para aprobacion
- Fecha: 15 de octubre de 2026
- Ambito: Evidence, Trust y Sharing

## Contexto

El modelo actual contiene `visibility`, `evidenceStatus`, validaciones y medios, pero no conserva revisiones inmutables ni el alcance exacto de una confirmacion. Una sola etiqueta no puede representar simultaneamente publicacion, respaldo y seguridad del archivo.

## Decision

Modelar dimensiones independientes:

1. ciclo de vida del registro y su revision actual;
2. estado de procesamiento de cada medio;
3. politica de visibilidad/proyeccion;
4. concesion dirigida con alcance, vigencia y revocacion;
5. solicitud y decision de respaldo ligadas a una revision/hash.

Una publicacion no concede acceso privado. Una concesion no confirma el contenido. Una confirmacion no publica. Un archivo procesado no es automaticamente publico.

Los registros actuales se conservan como declarados. Ningun backfill los eleva a confirmados ni inventa rol, proyecto, hora o propietario.

## Consecuencias

- Se requieren tablas nuevas append-only y migracion expand-first.
- Listados, detalle, medios, contadores, workers y analisis deben usar el mismo DTO autorizado.
- Revocar invalida nuevas lecturas y derivados dentro del TTL documentado, pero no promete recuperar descargas previas.
- La UI debe mostrar cada dimension con texto; el color no basta.
