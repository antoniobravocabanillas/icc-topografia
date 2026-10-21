# B4 / T13 — Necesidades privadas y descubrimiento explicable

## Estado

Implementación local terminada detrás de `TERRAQO_DISCOVERY_NEEDS_V1=false`. No se aplicó la migración ni se habilitó la función en producción.

## Incluido

- Necesidades privadas por workspace, con requisitos indispensables y deseables.
- Versiones append-only con control optimista e idempotencia por operación.
- Búsqueda de evidencia pública o incluida en una selección pública vigente.
- Explicaciones observables por requisito, actividad, herramienta y ubicación; no existe puntaje único de persona.
- Deduplicación por trayectoria/caso de trabajo para no contar archivos como trabajos independientes.
- Expedientes privados por workspace con versión exacta de cada evidencia y snapshot de autorización.
- Revalidación de acceso al leer: una fuente revocada, vencida o reemplazada deja de proyectarse en el expediente.
- API y navegación protegidas por feature flag y autorización de workspace.
- Interfaz administrativa responsive con estados de carga, éxito, error y vacío.

## Seguridad y límites

- Una referencia de evidencia no concede permisos nuevos.
- No se mutan versiones históricas de necesidades ni evidencias.
- No se publican necesidades como vacantes automáticamente.
- No se infiere compatibilidad, desempeño o aptitud mediante un score.
- La migración `20261017230000_discovery_needs` es expand-only y permanece sin aplicar.

## Verificación local

- `prisma format`
- `prisma validate`
- `prisma generate`
- `tsc --noEmit`
- ESLint focalizado
- `npm run test:discovery-needs-contract`

## Gate pendiente

1. Aplicar migración en una base staging aislada.
2. Activar `TERRAQO_DISCOVERY_NEEDS_V1=true` solo en staging.
3. Validar dos actores: administrador de empresa y profesional propietario de la evidencia.
4. Confirmar revocación de selección/grant y desaparición inmediata de la fuente en el expediente.
5. Recién entonces evaluar rollout gradual; producción permanece en HOLD.
