# ADR-007: decisiones profesionales pendientes tras retirar un piloto

## Estado

Aceptado para el candidato B1-B5 del 21 de octubre de 2026.

## Contexto

Las propuestas y cierres nacen dentro de un workspace habilitado, pero la
respuesta final pertenece al profesional. Retirar un workspace de la cohorte no
debe dejar al profesional sin posibilidad de aceptar, rechazar o pedir cambios
sobre una decisión que ya estaba pendiente.

## Decisión

- Se conserva lectura histórica (`readPreserved`).
- Las operaciones nuevas de empresa, revisiones y borradores requieren
  entitlement vigente.
- Una decisión profesional terminal ya pendiente queda exceptuada del
  allowlist del piloto mientras el flag global siga activo.
- La excepción no crea recursos ni amplía acceso: el dominio debe comprobar
  actor profesional, recurso exacto, estado pendiente, versión esperada e
  idempotencia antes de mutar.
- Reintentos de análisis IA no son decisiones terminales y siempre requieren
  entitlement y cupo vigentes.

## Consecuencias

El riesgo bajo de bypass de entitlement se acepta de forma acotada para evitar
que una empresa pueda bloquear unilateralmente una respuesta profesional. La
excepción debe volver a evaluarse antes de generalizar B4 fuera del piloto.

Responsable: producto y seguridad Terraqo. Revisión: antes de habilitar la
primera cohorte de producción.
