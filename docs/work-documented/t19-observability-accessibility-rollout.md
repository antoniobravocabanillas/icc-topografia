# T19 — Observabilidad, accesibilidad, móvil y rollback

Fecha: 18 de octubre de 2026.

## Alcance implementado localmente

- Envelope API compatible: `error.code`, `message`, `fieldErrors`, `retryable`, `requestId` y cabecera `x-request-id` correlacionada.
- Los errores internos registran tipo y correlación; no serializan consulta, stack, documento ni payload privado.
- La telemetría del navegador clasifica y calcula huellas SHA-256 antes de enviar. El endpoint no recibe mensaje ni stack crudos.
- Eventos de análisis con allowlist: IDs opacos, estado, proveedor, intentos, latencia, tokens y código de fallo.
- Los eventos se emiten después de persistir el estado correspondiente, incluidas cancelación y revocación.
- Un fallo de un componente cliente ya no deja un espacio vacío: muestra recuperación con foco, `role=alert`, reintento y recarga.
- El panel T13–T18 anuncia errores, progreso y cambios de estado; respeta movimiento reducido y usa objetivos de interacción de al menos 44 px en los controles incorporados.
- Ningún estado de recuperación aplica resultados, publica, envía mensajes o elimina datos.
- Solicitudes de conversación, propuestas y cierres recuperan fallos de red con `try/finally`: nunca dejan indefinidamente el panel en carga ni sus controles bloqueados.
- Los reintentos posteriores a una interrupción conservan la clave idempotente de la operación, evitando duplicar propuestas, decisiones o cierres cuando la respuesta original quedó incierta.
- Los errores de colaboración y cierre usan `role=alert`; las confirmaciones y cargas usan regiones `status` atómicas. La validación de bloqueo/reporte devuelve el foco al campo de motivo y mantiene un objetivo táctil mínimo de 44 px.
- Los paneles con colecciones vacías ya no se desmontan si existe un error de red: el aviso permanece visible, `aria-busy` vuelve a `false` y una recarga recupera los datos.

## Matriz S20 de recuperación

| Estado | Respuesta visible | Conservación y siguiente acción |
|---|---|---|
| Cargando | Estado anunciado, controles de mutación deshabilitados | Mantiene selección y permite navegar fuera |
| Vacío | Explica el primer paso sin fingir datos | Formulario manual disponible |
| Validación | Error asociado al flujo y sin mutación parcial | Corregir y reenviar |
| Sesión vencida / 401 | Envelope `AUTH_REQUIRED` | Reautenticar; el servidor no acepta la operación |
| Permiso / 403 | Envelope `FORBIDDEN` sin revelar terceros | Volver al origen autorizado |
| Recurso retirado / 404 | No confirma existencia fuera del ámbito | Recargar listado autorizado |
| Conflicto / 409 | Código estable e idempotencia protegida | Recargar versión y decidir de nuevo |
| Límite / 429 | `retryable` y límite aplicado por API | Continuar manualmente o esperar el período |
| Dependencia / 503 | Correlación y reintento explícito | No persiste resultado parcial |
| Fuente revocada | Claims ocultos y dossier marcado | Volver a fuentes o evaluación manual |
| Cancelado | Estado terminal, sin claims parciales | Crear un análisis nuevo si corresponde |
| Feature apagada | 404 compatible; UI no monta la función | Recorrido manual continúa disponible |
| Excepción de UI | Boundary accesible con foco | Reintentar componente o recargar página |

## Señales operativas y privacidad

Eventos admitidos: `analysis_queued`, `analysis_completed`, `analysis_failed`, `analysis_cancelled` y `analysis_source_revoked`.

No admitidos en propiedades: texto de documentos, mensajes, nombres, correos, ubicaciones, prompt o salida del modelo. Los logs actuales son transporte estructurado básico; la conexión futura a un colector debe conservar esta allowlist.

Alertas recomendadas para staging:

1. errores por endpoint y código con `requestId`;
2. p95/p99 de análisis y backlog `QUEUED`/`RETRY_WAIT`;
3. citas inválidas y revocaciones detectadas;
4. tokens y costo estimado por workspace sin contenido;
5. tasa de fallos y reintentos agotados.

## Rollout y rollback

Orden de activación por cohorte en staging:

1. aplicar migraciones en copia aislada y validar conteos;
2. `TERRAQO_DISCOVERY_NEEDS_V1=true` para lectura/escritura manual;
3. activar mensajería, colaboración y cierre solo después de sus gates;
4. configurar proveedor T18 manteniendo `TERRAQO_EVIDENCE_ANALYSIS_V1=false`;
5. habilitar análisis a una cohorte interna y medir;
6. ampliar solo con límites API y monitoreo activos.

Rollback: apagar primero `TERRAQO_EVIDENCE_ANALYSIS_V1` y después el flag del módulo afectado. No revertir ni borrar tablas, jobs, expedientes, revisiones o constancias. La lectura compatible y la evaluación manual permanecen; un downgrade de plan nunca cambia el significado histórico de un respaldo.

## Gate local ejecutado

- `npm run typecheck`.
- ESLint focalizado T18/T19 sin advertencias.
- `npm run test:evidence-analysis-contract`.
- `npm run test:recovery-observability-contract`.
- El contrato T19 también exige recuperación de red, liberación del estado ocupado, semántica diferenciada de alertas y foco de validación en los paneles T15–T17.
- `npm run build`: aprobado. Solo emitió advertencias preexistentes fuera de T18–T20 sobre símbolos sin uso e imágenes heredadas con `<img>`.
- `npm run test:b5-browser-accessibility`: aprobado sobre Next de producción, Auth.js, APIs reales y PostgreSQL local desechable. Validó pérdida de red y recuperación, foco obligatorio del motivo, navegación por teclado, ausencia de overflow y render visual en 320 px y zoom de navegador 200 %. La limpieza dejó 0 usuarios y 0 workspaces sintéticos.
- Evidencias visuales: `output/playwright/b5-accessibility/portal-messages-320-zoom-1.png` y `portal-messages-640-zoom-2.png`, revisadas sin recortes ni solapamientos funcionales.

## Gate que requiere staging/dispositivos

- NVDA/VoiceOver/TalkBack sobre recorrido real y estados adversos.
- Teclado móvil visible y lectores de pantalla sobre dispositivo físico. El gate automatizado ya cubre teclado de escritorio, zoom 200 % y viewport de 320 px con datos sintéticos reales.
- Contraste medido sobre render real y navegadores soportados.
- Pérdida de red, sesión expirada y conflicto concurrente con fixture aislado.
- Ensayo de rollout/rollback y alerta operativa con migración aplicada en copia.

T19 queda cerrado para el entorno local automatizado. La certificación de staging/dispositivo continúa pendiente y no autoriza migración ni despliegue.
