# Bitácoras: carga y recuperación de fotos

## Defectos encontrados

- El compositor enviaba hasta seis fotos de 8 MiB en un único multipart, incompatible con el límite de payload binario del hosting. El error genérico también podía aparecer cuando la respuesta del gateway no era JSON. No se dispone del request/log del incidente particular para atribuir su causa histórica con certeza.
- Después de crear el registro, el cliente descartaba su ID si fallaban las fotos. Reintentar podía crear otro registro.
- Una foto guardada cuya respuesta se perdía era rechazada como duplicada incluso al reintentar sobre la misma bitácora.
- El límite de seis fotos solo se comprobaba antes de cargar, sin serializar la finalización concurrente.

## Corrección

- Validación completa antes de crear la bitácora; máximo seis fotos de 8 MiB originales.
- Una foto por petición. Originales de hasta 3 MiB sin cambios; mayores se optimizan a JPEG, hasta 2560 px en su lado mayor, antes de enviar. Se informa en el selector.
- ID y cola pendientes conservados durante el intento; progreso, aviso al cerrar, campos bloqueados una vez guardados y botón explícito de reintento.
- El servidor reconoce hashes ya adjuntos al mismo registro sin cobrar almacenamiento otra vez. Reutilización entre bitácoras diferentes mantiene la regla existente.
- Finalización transaccional serializada por autor, nuevo conteo dentro de la transacción y liberación de almacenamiento/limpieza si falla.

## Verificación

- `node scripts/test-worklog-photo-upload.mjs`: 10 comprobaciones aisladas sobre el servicio y helper reales, con base de datos y almacenamiento en memoria.
- Playwright CLI, página local temporal con compositor real y endpoints interceptados: 10 comprobaciones. Carga secuencial, fuente artificial de 4 MiB optimizada, fallo en segunda foto, reintento solo pendiente, un único POST de creación, mismo ID, formulario limpio solo tras confirmación y rechazo de archivo >8 MiB.
- Escritorio 1280×900 y móvil 390×844; sin desborde horizontal. Capturas locales `output/playwright/worklog-photo-*-error.png`.
- TypeScript, ESLint de archivos modificados e Impeccable sin hallazgos. La página temporal de prueba fue eliminada antes del build.
- No se escribieron publicaciones de usuarios reales ni se hicieron cambios de esquema/base de datos.

## Alcance

Las fotos que nunca llegaron al servidor no pueden recuperarse automáticamente. La cola del compositor vive en esta página, no sobrevive a cerrarla. Las comprobaciones del servicio usan dependencias simuladas: no equivalen a una carga autenticada contra almacenamiento de producción.

Referencia del límite del proveedor: https://docs.netlify.com/build/functions/overview/#limitations
