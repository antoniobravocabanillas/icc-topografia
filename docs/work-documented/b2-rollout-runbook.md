# B2 - Runbook de rollout y rollback

Fecha: 17 de octubre de 2026.

## Precondiciones

1. Identificar por escrito la base de staging y confirmar que no es producción.
2. Tomar respaldo recuperable y comprobar acceso de restauración.
3. Mantener `TERRAQO_WORK_CASES_V1=false`.
4. Desplegar primero código compatible con el esquema anterior solo en una ventana coordinada; el código B2 completo requiere las columnas nuevas para consultas de bitácora.
5. Aplicar en orden las migraciones B1 pendientes y `20261016183000_worklog_revisions_work_cases`.

## Verificación de migración

- Todas las bitácoras históricas tienen una revisión número 1.
- `currentRevisionId` apunta a esa revisión.
- No existen dos recibos con el mismo `(actorId, operationKey)`.
- `TerraqoWorkCaseRecord.worklogId` es único.
- Los enums de lifecycle, relación y fase existen en el esquema `icc`.

## Recorrido de aceptación

1. Activar borrador local en un dispositivo de prueba y adjuntar dos imágenes válidas.
2. Interrumpir una carga y reintentar; confirmar que hash, filas y bytes no se duplican.
3. Volver a publicar la misma solicitud con la misma `Idempotency-Key`; confirmar el mismo ID.
4. Editar aporte/responsabilidades desde dos sesiones; confirmar conflicto `409` en la sesión desactualizada.
5. Habilitar `TERRAQO_WORK_CASES_V1=true` solo en staging.
6. Crear un trabajo con registros compatibles, asignar fases, desvincular uno y confirmar que el registro permanece.
7. Intentar combinar workspaces/proyectos distintos; debe fallar tanto en UI como en servidor.

## Observabilidad mínima

- Contar `422` de decodificación/seguridad de medios por tipo real detectado.
- Contar replay idempotente y conflictos de fingerprint `409` sin registrar contenido sensible.
- Medir fallos de Blob después de crear metadatos y ejecuciones de limpieza compensatoria.
- Medir conflictos de versión de revisiones y WorkCase.

## Rollback

1. Apagar `TERRAQO_WORK_CASES_V1`.
2. Revertir la superficie de UI/API que escribe WorkCase si se requiere; conservar tablas y datos.
3. No eliminar revisiones ni recibos idempotentes: son evidencia de auditoría y protección contra duplicados.
4. Si falla el procesamiento de imágenes, deshabilitar temporalmente nuevas cargas y mantener lectura de derivados ya confirmados.
5. Restaurar base solo ante corrupción verificada y mediante el procedimiento de infraestructura aprobado.

No ejecutar `prisma migrate reset`, `db push` ni eliminación de columnas como mecanismo de rollback.
