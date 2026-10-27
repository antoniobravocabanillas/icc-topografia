# B4 — Cierre T13 a T17

Fecha de cierre local: 18 de octubre de 2026.

Gate autenticado de staging: 27 de octubre de 2026.

## Resultado

B4 queda implementado localmente desde necesidad empresarial hasta constancia privada:

1. T13: necesidad versionada, búsqueda explicable y selección de fuentes autorizadas.
2. T14: expediente privado, criterios manuales, notas y preguntas versionadas.
3. T15: solicitud de conversación, contexto no autorizante, borradores e idempotencia de mensajes.
4. T16: propuesta de colaboración inmutable y aceptación explícita de ambas partes.
5. T17: cierre versionado, revisión profesional y constancia privada separada de publicación/archivos.

## Flags

Permanecen apagados por defecto:

- `TERRAQO_DISCOVERY_NEEDS_V1=false`
- `TERRAQO_CONTEXTUAL_MESSAGING_V1=false`
- `TERRAQO_COLLABORATION_V1=false`
- `TERRAQO_CLOSURE_V1=false`

No habilitar un flag posterior sin los anteriores y sin aplicar primero la migración en staging aislado.

## Gate ejecutado

- Prisma format/validate/generate: aprobado.
- TypeScript estricto: aprobado.
- ESLint focalizado de T13–T17: aprobado.
- Contratos discovery, mensajería contextual, colaboración y cierre: aprobados.
- Build Next.js de producción: aprobado.
- Advertencias del build: preexistentes en páginas/componentes ajenos a B4.
- Gate autenticado T15–T17 con Next/Auth/API/PostgreSQL reales: aprobado a 320 px y zoom 200 %, incluida recuperación de red, teclado, foco de validación y limpieza de fixtures.
- Gate HTTP/UI autenticado B4 en `https://terraqo-platform-staging.netlify.app`: aprobado con tres identidades, dos workspaces, aislamiento, replay idempotente, colisión `409`, dossier privado, contexto protegido, propuesta v2, rechazo de versión sustituida, cierre bilateral y constancia privada.
- PostgreSQL remoto expuso un `P2028` por expirar la transacción interactiva de aceptación. Se corrigió con presupuesto explícito de `maxWait=10 s` y `timeout=20 s`; los reintentos continúan limitados a colisión idempotente y serialización, no a `P2028`.
- Revisión visual aprobada con la propuesta v2 aceptada, dos versiones auditables, cierre v1 aceptado, entregables y constancia privada. Evidencia local: `output/playwright/platform-staging-b4-needs.png` y `output/playwright/platform-staging-b4-collaboration.png`.
- Limpieza posterior comprobada directamente en Supabase: cero usuarios, workspaces, bitácoras, necesidades, dossiers, solicitudes, colaboraciones y constancias.
- Rollback por flags aprobado en staging: B4 apagado devolvió `404` en sus superficies sin revertir schema; la restauración del mismo commit volvió a aprobar el gate autenticado completo y terminó con cero fixtures.

## No ejecutado deliberadamente

- Ninguna migración adicional: el gate usó el esquema B1–B5 previamente migrado en la base exclusiva de staging.
- Ningún seed, backfill ni modificación de datos reales.
- Ningún despliegue, cambio de flags o configuración en producción.
- Ningún envío de mensajes, propuestas o cierres a usuarios reales.

## Siguiente gate

B4 queda cerrado en staging. El siguiente bloque ejecutable es B5 con el proveedor apagado: comprobar entitlement de piloto/control, recuperación, límites, revocación de fuentes y observabilidad sin enviar contenido privado a un proveedor externo. La activación del dispatcher HTTPS y del proveedor sigue requiriendo una fase separada.
