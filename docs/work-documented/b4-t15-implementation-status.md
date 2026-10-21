# B4 / T15 — Solicitud y mensajería contextual

## Estado

Implementación local terminada detrás de `TERRAQO_CONTEXTUAL_MESSAGING_V1=false`. No se aplicó la migración ni se habilitó o desplegó el módulo.

## Incluido

- Solicitud de conversación desde un expediente privado, con nota opcional y clave idempotente.
- Bandeja de solicitudes entrantes y salientes para empresa y profesional.
- Decisiones explícitas: aceptar, rechazar, bloquear o reportar; bloquear/reportar exige motivo.
- La aceptación crea una conversación con ambos participantes y una referencia contextual neutral.
- El profesional nunca recibe el identificador, título interno, criterios, notas ni fuentes del expediente.
- Referenciar evidencia o expediente en una conversación no concede permisos sobre esos recursos.
- El borrador del compositor se conserva por conversación en el navegador.
- Envíos de texto y adjuntos usan una clave de operación estable durante reintentos para evitar duplicados.
- Los reintentos concurrentes de mensajes recuperan la operación ya confirmada cuando corresponde.
- Estados visibles de envío y error existentes en el compositor se mantienen; el borrador solo se limpia tras éxito.
- Las conversaciones contextuales no muestran videollamada: llamadas y video quedan fuera de T15.

## Seguridad y privacidad

- La empresa solo crea solicitudes desde un workspace autorizado y un expediente propio no archivado.
- El destinatario es el único autorizado para decidir la solicitud, con control optimista de versión.
- Una relación bloqueada impide nuevas solicitudes desde el mismo workspace.
- La consulta de conversaciones exige participación activa; para un participante externo solo se expone contexto neutral.
- Mensajes y adjuntos validan participación y que el módulo del workspace siga activo.
- El recibo idempotente liga actor, clave, huella y mensaje; reutilizar la clave con otro contenido devuelve conflicto.
- Los adjuntos mantienen controles de tipo, cuota y almacenamiento ya existentes.

## UX

- Panel compacto con contraparte, dirección, estado y acciones inequívocas.
- Motivo solicitado únicamente para bloquear o reportar.
- Las conversaciones aceptadas se abren desde la misma bandeja.
- Banner contextual explica que la referencia no abre expedientes, evidencias ni documentos.
- La interfaz se mantiene detrás del flag para no exponer rutas incompletas.

## Gate local

- `prisma validate`.
- `tsc --noEmit`.
- ESLint focalizado sin errores ni advertencias.
- `test:contextual-messaging-contract`: validación de decisiones, huella idempotente y proyección neutral.
- `test:discovery-needs-contract`: regresión T13/T14.
- Build de producción completado; solo mostró advertencias preexistentes fuera de T15.

## Pendiente de staging

1. Aplicar la migración expand-only en una base aislada.
2. Activar ambos flags B4 solo en staging.
3. Probar solicitud con administrador de empresa y decisión con profesional real en dos sesiones.
4. Confirmar que el profesional no puede recuperar el dossier por API, URL ni payload de conversación.
5. Simular doble envío y pérdida de respuesta para comprobar un solo mensaje/adjunto persistido.
6. Verificar rechazo, bloqueo y reporte, incluida la imposibilidad de una nueva solicitud bloqueada.
