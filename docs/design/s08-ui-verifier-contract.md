# S08: contrato de interfaz y validación local

Referencia inspeccionada: `C:/Users/Binv/Downloads/02-ui-ux-pantallas.pdf`, página 9, y `output/s06-ux.txt`, líneas 402–408. Se conserva composición oscura con evidencia fijada y revisión en dos columnas; móvil apila ambas. No se muestran ni solicitan archivos privados del propietario: el DTO actual autoriza campos, no medios.

## Integración y selectores QA

- SSR entrega `selectedRequestId` opcional a `EndorsementConsole`, tras filtrar identidad, autoridad y solicitud en `/portal/respaldos?solicitud=<id>`. El cliente no consulta otra solicitud ni interpreta IDs como autorización.
- En bandeja, enlace accesible `Revisar solicitud` apunta a esa ruta exacta. Regreso: `Volver a solicitudes`.
- Se conserva `data-testid="endorsement-request-<id>"` como contenedor de toda la vista y `endorsement-status` para el estado recibido. Compatibles con `scripts/lib/s08-review-browser.ts` de QA; no se modifican sus verificadores.
- Dentro: `s08-review` (región `Revisar solicitud de respaldo`), `s08-evidence` (región `Evidencia solicitada`), región `Revisar aspectos solicitados`, `s08-aspect-<campo>` (fieldset con nombre del aspecto), `s08-submit`.
- Radios: `Confirmar`, `No puedo confirmar`, `Solicitar aclaración`; ninguna respuesta preseleccionada. Textareas: `Comentario (opcional)`, `Aclaración necesaria`, `Comentario general (opcional)`. Aclaración vacía o con espacios bloquea envío. Botón: `Registrar revisión de N aspectos`.
- `s08-newer-revision` solo con `revision.worklog.newerRevisionAvailable === true`: informa y mantiene la revisión original, sin confirmar datos nuevos.
- `s08-historical-unavailable` solo si `historicalContextUnavailable === true` y alcance contiene `occurredAt`/`locationLabel`: campos históricos sin valores mutables, respuestas y submit bloqueados.
- POST envía `expectedVersion`, `expectedRevisionId`, `expectedRevisionHash`, respuestas exactas y comentarios recortados. Misma carga tras fallo incierto conserva Idempotency-Key; bloqueo síncrono evita doble clic.
- 403/404/410 retiran inmediatamente evidencia y formulario; 409 conserva respuestas y bloquea reenvío. `Recargar solicitud` vuelve a ejecutar autorización SSR. Caducidad/revocación no renderizan evidencia ni formulario; decisión finalizada no ofrece otro envío.
- Personal por defecto. Una organización proyectada por SSR muestra revisión vinculada a su nombre; el servidor debe comprobar permiso empresarial al registrar y al replay.

## Reproducción

1. `node scripts/fixtures/s08-harness.mjs` (127.0.0.1:3198, configuración desechable en `output/s08-ui-fixture`, sin cargar env/backend).
2. `node scripts/test-s08-review-browser.mjs`.
3. Artefactos: `output/s08-ui-{1440,375,320}.png`, `output/s08-historical-375.png`, `output/s08-large-text.png`, `output/s08-ui-results.txt`.

PASS local: tres tamaños; textos al 200 % sin overflow; navegación por teclado de radio; cero respuestas predeterminadas; aclaración obligatoria; alcance fijado sin título fuera de alcance; selección de solicitud exacta; aviso de versión nueva; bloqueo histórico solo en campos afectados; expirado/revocado/finalizado/no disponible; payload con versión/id/hash; pérdida de respuesta y reintento misma clave; doble clic una escritura; errores 404/409; cero solicitudes de medios privados; cero errores JS. Capturas desktop/móvil inspeccionadas. Detector Impeccable sin hallazgos.

Límites: respuestas API interceptadas en navegador y DTO sintético. No prueba sesiones reales, autorización SSR/empresarial, persistencia, idempotencia transaccional ni entrega de avisos. El gate hosted de QA debe probar esos comportamientos. Sin cambios de backend o scripts hosted por el dueño UI; sin commit ni deploy.

Cierre de estáticos: PASS ESLint focalizado en los tres componentes y los tres archivos de fixture/prueba; PASS `npx tsc --noEmit --incremental false` sobre el checkout compartido; PASS diff-check focalizado. Sin verificaciones ejecutándose al entregar.
