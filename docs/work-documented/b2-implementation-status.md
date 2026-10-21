# B2 - Captura, revisión y organización del trabajo

Fecha de corte: 17 de octubre de 2026.

## Resultado local

La implementación segura de B2 está completa en código y permanece retenida para release. Evoluciona la bitácora existente; no crea una segunda fuente de verdad para evidencia profesional.

### T06 - Medios seguros

- El servidor trata nombre, extensión y MIME del cliente como datos no confiables.
- `sharp` decodifica los bytes, limita dimensiones/píxeles y rechaza contenido animado o multipágina.
- Se persiste un derivado WEBP normalizado, sin metadatos ni perfiles embebidos.
- El hash SHA-256 del original conserva la deduplicación y el reintento de una foto no crea otra fila.
- La cuota, propiedad del registro, almacenamiento privado y limpieza compensatoria existentes se mantienen.

### T07 - Borrador, recuperación e idempotencia

- El borrador local requiere consentimiento explícito por perfil y advierte sobre equipos compartidos.
- IndexedDB conserva campos y `File`/`Blob`; no convierte fotos a `localStorage` ni las envía antes de publicar.
- El compositor restaura campos, fotos pendientes y el ID servidor cuando existe.
- La publicación usa una clave UUID idempotente y un recibo servidor ligado al actor, contenido y bitácora.
- Repetir la misma operación devuelve el registro existente; reutilizar la clave con otro contenido falla con `409`.
- Las revisiones usan `expectedVersion` y bloquean escrituras perdidas con `409`.

### T08 - Revisión y contribución estructurada

- Cada bitácora nueva crea una revisión inmutable número 1 y conserva un hash determinista.
- Las ediciones crean una revisión append-only y actualizan `currentRevisionId` dentro de una transacción serializable.
- Se añadieron aporte, responsabilidades, métodos y herramientas con validación Zod y límites explícitos.
- El contenido actual sigue reflejado en `TerraqoWorklogEntry` para compatibilidad; la historia vive en `TerraqoWorklogRevision`.

### T09 - WorkCase explícito

- `TerraqoWorkCase` organiza registros sin sustituir la continuidad legacy.
- Cada bitácora puede pertenecer como máximo a un WorkCase.
- Las relaciones se crean `CONFIRMED`; la UI no preselecciona ni infiere relaciones.
- El primer registro seleccionado fija workspace y proyecto; los contextos incompatibles quedan deshabilitados.
- Desvincular elimina solo la relación, nunca la bitácora.
- Altas y bajas usan transacciones serializables, bloqueo y versión optimista.

## Controles de despliegue

- `TERRAQO_WORK_CASES_V1=false` por defecto.
- La migración `20261016183000_worklog_revisions_work_cases` es expand-only y no fue aplicada.
- No habilitar el flag antes de aplicar la migración en staging y completar el recorrido manual.
- Rollback operativo inicial: apagar el flag. No borrar revisiones, recibos idempotentes ni relaciones para revertir interfaz.

## Evidencia local

- `npx prisma format`: aprobado.
- `npx prisma validate`: aprobado.
- `npm run prisma:generate`: aprobado.
- `npm run typecheck`: aprobado.
- `npm run test:worklog-media-security`: aprobado.
- `npm run test:worklog-revision`: aprobado.
- `npm run test:worklog-create-operation`: aprobado.
- `npm run test:worklog-archive`: aprobado.
- ESLint focalizado B2: aprobado.
- `npm run build`: aprobado; conserva advertencias preexistentes fuera de B2.
- `git diff --check`: sin errores; solo avisos de normalización LF/CRLF de Windows.

## Gates externos pendientes

1. Aplicar la migración en una base de staging anonimizada y claramente identificada.
2. Ejecutar allí: crear bitácora con varias fotos, simular pérdida de respuesta y reintentar con la misma clave; debe existir una sola bitácora y un solo medio por hash.
3. Cerrar y reabrir el navegador con borrador autorizado; verificar restauración de campos y blobs.
4. Editar la misma bitácora desde dos sesiones; la segunda escritura debe recibir `409` y conservar ambas versiones válidas.
5. Crear y desvincular un WorkCase; comprobar que las bitácoras sobreviven y que no se aceptan contextos cruzados.
6. Validar teclado, lector de pantalla real, móvil estrecho y mensajes de recuperación con una cuenta autenticada.

## Estado

- **Implementación local:** COMPLETA.
- **Validación automatizada local:** APROBADA.
- **Migración remota:** NO EJECUTADA.
- **Release:** HOLD hasta completar los gates externos.
