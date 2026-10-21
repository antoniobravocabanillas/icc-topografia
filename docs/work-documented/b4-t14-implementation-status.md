# B4 / T14 — Expediente privado y evaluación manual

## Estado

Implementación local terminada detrás de `TERRAQO_DISCOVERY_NEEDS_V1=false`. No se aplicó la migración ni se habilitó en producción.

## Incluido

- Expediente privado aislado por workspace y ligado a una versión exacta de la necesidad.
- Criterios evaluables como `DOCUMENTED`, `DECLARED`, `ENDORSED`, `CONFIRMED` o `UNKNOWN`.
- Los estados documentado, respaldado y confirmado exigen una fuente autorizada vigente.
- `UNKNOWN` exige explicar qué falta confirmar; no se inventan conclusiones.
- Cada cambio de criterio crea una revisión append-only y conserva el historial.
- Referencias de fuentes por revisión y huella de contenido; una fuente revocada se oculta y marca el criterio afectado.
- Notas internas append-only, visibles solo en rutas administrativas del workspace.
- Preguntas de confirmación como borradores editables y versionados; guardar no envía mensajes.
- Estados explícitos del analizador: manual/no solicitado, procesando, listo, fallo, insuficiente y fuente retirada.
- Flujo humano completo sin IA, scoring personal ni inferencias psicológicas.

## Seguridad

- Toda mutación valida sesión, rol administrativo, workspace y pertenencia del recurso.
- Idempotencia por operación y transacciones serializables.
- Control optimista por número de revisión en criterios y preguntas.
- Una fuente se reautoriza antes de citarla y cada vez que se lee el expediente.
- Notas, criterios y preguntas no se incluyen en DTOs profesionales o públicos.

## Gate local

- `prisma format`, `prisma validate` y `prisma generate`.
- `tsc --noEmit`.
- ESLint focalizado sin advertencias.
- Contratos de validación y matching en `test:discovery-needs-contract`.
- Build de producción requerido antes de cerrar el bloque.

## Pendiente de staging

1. Aplicar la migración expand-only en una base aislada.
2. Activar el flag solo en staging.
3. Validar administrador de empresa vs. profesional: el profesional no debe poder leer expediente, notas ni criterios.
4. Revocar una selección/grant y comprobar que la fuente desaparece y el criterio queda advertido.
5. Verificar edición concurrente e idempotencia con dos sesiones administrativas.
