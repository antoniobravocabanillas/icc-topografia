# ADR-004 - Compartición y respaldo con alcance versionado

- Estado: aceptado para implementación local
- Fecha: 17 de octubre de 2026
- Ámbito: B3 / Trust + Sharing

## Contexto

`TerraqoWorklogValidation` confirma hoy una bitácora completa y mutable dentro de un workspace. `TerraqoWorklogEntry.visibility` decide audiencia general. Ninguno representa una selección versionada, una concesión dirigida y revocable, ni un respaldo limitado a campos de una revisión inmutable.

Promover validaciones históricas a respaldos B3 ampliaría su significado y podría presentar como confirmado contenido que el revisor nunca vio.

## Decisión

- Conservar `TerraqoWorklogValidation` como historial legacy y no migrarlo automáticamente.
- Una selección (`TerraqoShareCollection`) referencia revisiones concretas, no el contenido mutable actual.
- Una concesión (`TerraqoAccessGrant`) autoriza un destinatario, scopes y vigencia; guardar la colección no envía ni concede por sí solo.
- Una proyección pública es una decisión explícita separada y revocable.
- Una solicitud de respaldo fija revisión, hash, destinatario, organización opcional, relación y campos solicitados.
- Las decisiones son append-only, sin respuestas preseleccionadas y sin elevar “no puedo confirmar” a rechazo de la trayectoria.
- La autorización de lectura se evalúa en servidor y falla cerrada. Tokens portadores se almacenan solo como hash.

## Consecuencias

- Editar una bitácora no altera el alcance de una solicitud o decisión anterior.
- Revocar una concesión bloquea nuevas lecturas, pero no promete borrar copias ya descargadas.
- Confirmación personal y representación empresarial son estados distintos; la autoridad se captura al decidir.
- Los contadores legacy y B3 no se suman como si fueran la misma unidad.
