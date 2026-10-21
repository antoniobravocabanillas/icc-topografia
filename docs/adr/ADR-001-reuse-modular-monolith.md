# ADR-001 - Reutilizar el monolito modular y los nucleos existentes

- Estado: propuesto para aprobacion
- Fecha: 15 de octubre de 2026
- Ambito: Trabajo documentado

## Contexto

El repositorio ya implementa identidad Auth.js, usuarios, workspaces, membresias, equipos, conversaciones, suscripciones, notificaciones, almacenamiento y bitacoras. Crear equivalentes para la nueva especificacion produciria identidades divergentes, controles de acceso inconsistentes y migraciones de alto riesgo.

## Decision

Mantener un monolito modular sobre Next.js, PostgreSQL y Prisma. Reutilizar:

- `User` y Auth.js como identidad global.
- `TerraqoWorkspaceMember` como pertenencia y autoridad organizacional.
- `TerraqoProfessionalProfile` como identidad profesional.
- `TerraqoWorklogEntry` como raiz de evidencia durante la migracion.
- `TerraqoConversation` y participantes como mensajeria.
- modulos, suscripciones y buckets como entitlements.
- Netlify Blobs y Background Functions como infraestructura inicial de medios/jobs.

Los nuevos dominios se implementan detras de servicios y feature flags. No se introducen microservicios ni una API paralela solo por la nueva taxonomia.

## Consecuencias

- Menor duplicidad y una sola fuente de identidad/pertenencia.
- Las nuevas entidades deben referenciar IDs existentes.
- Los helpers actuales de autorizacion deben converger en una politica central.
- Las rutas actuales y sus enlaces se mantienen durante la migracion.
