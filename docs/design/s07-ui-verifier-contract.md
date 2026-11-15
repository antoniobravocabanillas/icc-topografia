# S07 · Solicitar respaldo

Referencia visual: pantalla 7 de 02-ui-ux-pantallas.pdf (página 8).

Selectores de la prueba de interfaz:
- region `Solicitar respaldo` / `Mis solicitudes de respaldo`.
- `getByLabel`: Version de evidencia (con tilde en UI), Correo del revisor, Relacion profesional (con tilde), Vigencia.
- region `Contenido que revisará el destinatario`; checkboxes por etiqueta de aspecto existente.
- botones `Guardar borrador`, `Enviar solicitud`; confirmacion inline `Confirmo enviar a ...`; boton final `Confirmar y enviar`.
- articulos `data-testid="endorsement-request-<id>"`; estado `data-testid="endorsement-status"`.
- botones por articulo `Enviar borrador`, `Reenviar solicitud`, `Revocar solicitud`; consentimiento borrador y revocacion inline.

Reenvio: PATCH /api/v1/endorsement-requests/[id] con {action:'resend',expectedVersion}; solo PENDING/IN_REVIEW, vigentes, espera 24h desde updatedAt. sentAt conserva primer envio. HTTP 429 muestra error sin ocultar solicitud ni decisiones.
Datos caducados/revocados entrantes: solo metadatos, no campos ni comentarios de decisiones. La API mantiene autoridad sobre identidad, permisos y limitacion.
Fixtures locales sin servicios externos: /respaldo-preview, ?scenario=history o ?scenario=empty.

## Validacion local UI

- Arranque reproducible: `node scripts/fixtures/s07-harness.mjs` (puerto 3197, configuracion desechable en output/s07-ui-fixture).
- Suite: `node scripts/test-endorsement-preview-browser.mjs`.
- PASS Chromium 1440/375/320: vista previa solo campos autorizados, consentimiento invalidado al cambiar correo/version/alcance, borrador sin enviar, envio confirmado, payloads exactos, reintento con misma clave idempotente y bloqueo de doble click, cooldown/reenvio/429, revocacion conservando decisiones, estados y campos/miniaturas ocultos para destinatarios caducados/revocados.
- PASS preseleccion initialRevisionId, regreso con filtro exacto `?registro=<id>#worklog-<id>`, singular `1 solicitud` y `1 aspecto`.
- Capturas: output/s07-ui-1440.png, output/s07-ui-375.png, output/s07-ui-320.png. Referencia: output/s07-reference-page8.png.
- ESLint de archivos propios PASS; detector Impeccable sin hallazgos; diff-check de archivos propios PASS.
- No se modificaron backend, configuracion versionada de fixtures, ni archivos del verificador. Sin commit ni despliegue.
- Chequeo global final: `npx tsc --noEmit --incremental false` PASS, tras actualizarse el verificador en paralelo.
- Harness incluye fuentes Satoshi locales; la suite comprueba su carga antes de capturar.
