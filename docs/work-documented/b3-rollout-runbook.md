# B3 - Runbook de rollout y rollback

Fecha: 17 de octubre de 2026.

## Precondiciones

1. Identificar la base de staging por nombre/host y confirmar por escrito que no es producción.
2. Tomar respaldo recuperable y comprobar el procedimiento de restauración.
3. Mantener `TERRAQO_SCOPED_SHARING_V1=false` y `TERRAQO_SCOPED_ENDORSEMENTS_V1=false`.
4. Aplicar primero las migraciones B1/B2 pendientes que crean revisiones inmutables.
5. Aplicar `20261017120000_scoped_sharing_endorsements` sin `db push`, `migrate reset` ni DDL manual improvisado.

## Verificación de migración

- Existen enums de lifecycle y estado B3 en esquema `icc`.
- Todas las FK de selección y respaldo apuntan a revisiones/usuarios/workspaces válidos.
- Son únicas las claves `(createdById, operationKey)`, `(issuedById, operationKey)`, `(requesterId, operationKey)` y `(requestId, operationKey)`.
- `tokenHash`, slug público y `(collectionId, revisionId)` son únicos.
- No existe ninguna colección, concesión, proyección o solicitud creada por la migración.

## Recorrido de aceptación

1. Activar solo `TERRAQO_SCOPED_SHARING_V1=true` en staging.
2. Crear una selección sin campos: la UI debe impedirlo y el servidor debe responder `422` si se fuerza.
3. Crear una selección válida y repetir el POST con la misma clave: debe retornar el mismo ID; otro payload con esa clave debe responder `409`.
4. Conceder lectura por correo, copiar el enlace y probar identidad correcta, identidad distinta, caducidad y revocación.
5. Solicitar descarga sin medios o sin `VIEW_COLLECTION`: debe responder `422`.
6. Publicar evidencia personal y verificar que solo salgan campos permitidos y WEBP autorizados.
7. Intentar publicar material de workspace: debe fallar hasta S24.
8. Revocar la proyección y comprobar `404` en página, API y media.
9. Activar `TERRAQO_SCOPED_ENDORSEMENTS_V1=true` en staging.
10. Guardar borrador y verificar que el revisor no lo vea como pendiente; enviarlo explícitamente.
11. Responder sin cubrir todos los aspectos o pedir aclaración sin comentario: debe responder `422`.
12. Resolver desde dos sesiones con la misma versión: una gana y la otra recibe `409`.
13. Probar respaldo empresarial, retirar autoridad y confirmar que una decisión posterior se rechaza.

## Observabilidad mínima

- Contar creaciones, replay idempotente y conflictos de fingerprint por recurso, sin registrar contenido ni tokens.
- Contar denegaciones por identidad, scope, vencimiento y revocación.
- Contar conflictos optimistas `409` y validaciones `422` por código estable.
- Alertar si una URL revocada obtiene respuesta exitosa después de la revocación.
- Medir decisiones por estado sin exponer comentarios ni campos profesionales en logs.

## Rollback

1. Apagar ambos flags; esto retira navegación y hace que APIs/páginas fallen cerradas.
2. Revertir UI/API si se requiere, conservando tablas y datos append-only.
3. No borrar decisiones, hashes, grants revocados, recibos idempotentes ni auditoría.
4. No reactivar material empresarial público mientras S24 no tenga autorización explícita.
5. Restaurar base solo ante corrupción confirmada y usando el respaldo aprobado.

El rollback operativo no elimina columnas ni registros. Los datos B3 permanecen para auditoría y una reactivación segura.
