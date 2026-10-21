# Jornadas — aislamiento de la cola offline de ubicación

Fecha: 19 de octubre de 2026.

## Riesgo corregido

La cola IndexedDB almacenaba muestras únicamente por `attendanceId`. Al cambiar de cuenta o workspace en el mismo navegador, una muestra anterior podía intentar sincronizarse contra el endpoint de la sesión actual. El servidor la rechazaba por autorización, pero esa jornada quedaba al inicio de la cola y podía impedir que se procesaran muestras posteriores válidas.

## Contrato implementado

- Cada muestra nueva queda vinculada localmente a usuario y workspace.
- La sincronización solo selecciona muestras de ese scope.
- Una muestra legacy sin scope únicamente puede recuperarse cuando coincide con la jornada activa actual; nunca se reasigna por similitud ni se envía bajo otra identidad.
- Si una jornada es rechazada, se conserva para revisión/reintento, pero el ciclo puede continuar con otras jornadas del mismo scope.
- El límite local de 1 500 muestras elimina exactamente las más antiguas, incluso si la cola ya excedía el límite por escrituras concurrentes o una versión anterior.
- Ningún error elimina muestras no confirmadas por el servidor.
- Entre pestañas del mismo navegador existe una única propietaria del seguimiento. Las demás muestran un estado de espera, reintentan cada 15 segundos y asumen la captura cuando la propietaria cierra o deja vencer su concesión.
- Renovar y liberar la concesión exige seguir siendo su propietaria; una pestaña antigua no puede interrumpir a la nueva después de un takeover.

## Validación local

- `npm run test:attendance-location-queue`: aislamiento usuario/workspace, compatibilidad legacy acotada, batches no bloqueantes y poda exacta.
- `npm run test:attendance-tracker-lease`: propietario único, rechazo de competidor activo, takeover por vencimiento y renovación/liberación protegidas.
- `npm run test:attendance-location-ownership`: compatibilidad legacy y política fail-closed cuando una jornada con huella recibe una huella distinta o ausente.
- `npm run typecheck`.
- ESLint focalizado sin advertencias.
- `git diff --check` aprobado.
- `npm run build` aprobado; conserva únicamente advertencias preexistentes fuera de este bloque.
- Gate con Chromium real mediante Playwright CLI y el módulo de producción empaquetado sin dobles: la muestra se escribió con la red desactivada, persistió tras recargar y, al restablecer la conexión, la lectura scoped recuperó solo `user-a/workspace-a`. La limpieza confirmada conservó las muestras de otro usuario, otro workspace y una jornada legacy ajena. Resultado final sin errores de consola.

El arnés reproducible y su bundle están en `output/playwright/attendance-location-queue/`; la evidencia visual de la ejecución quedó en `.playwright-cli/page-2026-10-20T00-16-54-102Z.png`.

No se ejecutaron migraciones, despliegues ni escrituras en bases de datos. El seguimiento web continúa sujeto a las restricciones del navegador: una pestaña cerrada o suspendida por el sistema operativo no garantiza captura continua en segundo plano.

La concesión local coordina pestañas que comparten `localStorage`. Chrome y Edge, perfiles distintos o dispositivos distintos no comparten ese almacenamiento, pero el servidor ya restringe la sincronización del recorrido a la huella HMAC del navegador que marcó la entrada. Si otro navegador intenta enviar puntos, el cliente deja de capturar, elimina únicamente esas muestras terminalmente rechazadas y muestra “Recorrido vinculado a otro navegador”; la salida continúa habilitada.

No se usa la IP como identidad estable: redes móviles, NAT y VPN pueden cambiarla o compartirla. La huella de red se conserva como señal de riesgo, mientras que la propiedad del recorrido se compara con la huella de agente registrada en la entrada. Un takeover entre navegadores requeriría un flujo explícito y auditable; no se concede automáticamente. Esta corrección reutiliza el contrato servidor existente y no requiere migración.

La comparación servidor no admite degradación: si la entrada tiene huella y la solicitud omite `User-Agent` o no puede producir la misma firma, se clasifica como navegador ajeno. Solo las entradas históricas que nunca almacenaron huella conservan el modo legacy.
