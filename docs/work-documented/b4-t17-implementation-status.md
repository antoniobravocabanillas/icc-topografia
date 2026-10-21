# B4 / T17 — Cierre bilateral y constancia privada

## Estado

Implementación local terminada detrás de `TERRAQO_CLOSURE_V1=false`. No se aplicó la migración, no se habilitaron flags y no se desplegó.

## Incluido

- Cierre disponible únicamente para una colaboración con versión de alcance aceptada.
- Borrador con contribución, entregables, resultado, extracto autorizado y referencias opcionales.
- Cada guardado crea una revisión inmutable; guardar no envía, publica ni mueve archivos.
- Envío explícito de la revisión actual al profesional.
- Revisión profesional exacta con aceptar, solicitar corrección o no aceptar.
- Corrección y desacuerdo conservan comentario e historial y no emiten constancia.
- La aceptación emite una constancia privada con partes, alcance, rol, versiones, contribución, entregables, resultado, actor y fecha.
- La constancia queda separada de los archivos fuente; no promete acceso permanente a adjuntos internos.
- Referencia de cierre en la conversación solo después de aceptar la misma revisión.
- Historial visible de revisiones y estados para ambas partes.

## Autorización de referencias

- La API admite únicamente revisiones públicas vigentes del profesional como referencias iniciales.
- Las referencias se fijan por ID, huella y snapshot de autorización.
- El acceso se revalida al enviar y al aceptar; una fuente retirada bloquea la operación.
- La constancia no incorpora binarios ni crea permisos sobre los archivos citados.

## Seguridad y consistencia

- Solo el workspace de la colaboración prepara y envía el cierre.
- Solo el profesional destinatario puede decidirlo.
- Guardado, envío y decisión usan claves de operación, control de versión, bloqueo y transacción serializable.
- Una revisión enviada no se sobrescribe; debe resolverse antes de preparar otra.
- La constancia tiene unicidad por cierre y revisión, y es privada por defecto.
- Aceptar no publica la constancia; compartir queda para un paso S06 independiente.

## Gate local

- `prisma format`, `prisma validate` y `prisma generate`.
- `tsc --noEmit`.
- ESLint focalizado.
- `test:closure-contract` para borrador, decisión, huellas y emisión/no emisión.
- Contratos T13–T16 como regresión.
- Build de producción completado; solo mostró advertencias preexistentes fuera de T17.

## Pendiente de staging

1. Aplicar la migración expand-only en base aislada.
2. Habilitar los flags B4 en orden hasta cierre, únicamente en staging.
3. Guardar borrador y comprobar que el profesional todavía no lo recibe.
4. Enviar, pedir corrección, crear otra revisión y aceptar la exacta.
5. Revocar una referencia antes de envío y aceptación; ambas operaciones deben bloquearse.
6. Verificar que la constancia no aparece públicamente ni permite descargar adjuntos.
