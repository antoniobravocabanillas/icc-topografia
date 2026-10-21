# B4 / T16 — Propuesta y aceptación de colaboración

## Estado

Implementación local terminada detrás de `TERRAQO_COLLABORATION_V1=false`. No se aplicó la migración, no se habilitaron flags y no se desplegó.

## Incluido

- Propuesta creada únicamente desde una conversación contextual previamente aceptada.
- Alcance, rol, entregables, periodo opcional y condiciones pertinentes por versión.
- La empresa registra aceptación explícita al enviar; el profesional decide sobre esa versión exacta.
- Decisiones profesionales: aceptar, rechazar o solicitar cambios, sin opción preseleccionada.
- Rechazo y solicitud de cambios exigen comentario y conservan el historial.
- Cambiar alcance crea una revisión inmutable; una propuesta pendiente anterior queda sustituida y no puede aceptarse.
- Una revisión aceptada no autoriza futuras modificaciones: cada nueva revisión exige otra aceptación.
- El acuerdo conserva ambas aceptaciones, actores, fechas, versión y huella de operación.
- La colaboración solo pasa a `ACCEPTED` cuando la versión cuenta con aceptación de workspace y profesional.
- Referencia estructurada de la propuesta aceptada en la conversación, sin conceder permisos adicionales.
- Vista compartida para empresa y profesional con historial de versiones y acceso a la conversación.

## Límites explícitos

- Aceptar no firma un contrato legal.
- Aceptar no crea relación laboral, proyecto, cobro ni pago.
- No se infiere aceptación desde mensajes informales.
- T16 no emite constancia ni publica contenido; esas acciones pertenecen a T17 y S06.

## Seguridad y consistencia

- Creación y revisión exigen actor administrativo del workspace y módulo autorizado.
- La conversación debe pertenecer al workspace y contener una solicitud aceptada al profesional.
- Solo el profesional destinatario decide la propuesta.
- Mutaciones críticas usan bloqueo, transacción serializable, control optimista e idempotencia.
- Reutilizar una clave con otro contenido o decidir una versión sustituida devuelve conflicto.
- El profesional solo lista colaboraciones dirigidas a su usuario; el workspace solo lista las propias.

## Gate local

- `prisma format`, `prisma validate` y `prisma generate`.
- `tsc --noEmit`.
- ESLint focalizado.
- `test:collaboration-contract` para contrato, fechas, entregables, huellas y estados.
- Contratos T13–T15 como regresión.
- Build de producción completado; solo mostró advertencias preexistentes fuera de T16.

## Pendiente de staging

1. Aplicar la migración expand-only en base aislada.
2. Habilitar mensajería contextual y colaboración solo en staging.
3. Crear propuesta como empresa y decidirla como profesional en sesiones separadas.
4. Simular doble envío, pérdida de respuesta y dos decisiones simultáneas.
5. Confirmar que una versión sustituida no puede aceptarse por API.
6. Confirmar que no se crea proyecto, cobro, relación laboral ni publicación por efecto lateral.
