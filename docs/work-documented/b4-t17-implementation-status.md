# B4 / T17 — Cierre bilateral y constancia privada

## Estado

Implementación y gate autenticado terminados en el entorno exclusivo de staging. `TERRAQO_CLOSURE_V1` permanece apagado por defecto y solo está habilitado dentro de la cohorte B4 de staging; producción no fue modificada.

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

## Gate de staging

- Deploy aislado validado: `6adfe769a843183fbe090819`.
- Tres sesiones Credentials y dos workspaces sintéticos; el usuario ajeno conservó una colección vacía.
- La propuesta v1 sustituida devolvió `409`; la v2 exacta fue aceptada.
- El cierre v1 fue guardado, enviado y aceptado por el profesional exacto.
- La constancia fue emitida `privateByDefault=true`, sin publicar fuentes ni adjuntos.
- La UI profesional mostró propuesta v2 aceptada, historial de dos versiones, cierre y constancia.
- El runner limpió los fixtures y una consulta independiente confirmó ocho conteos críticos en cero.

## Riesgo corregido

La aceptación remota detectó Prisma `P2028` porque la transacción interactiva excedía el timeout por defecto. El cierre ahora usa `Serializable`, `maxWait: 10_000` y `timeout: 20_000`. `P2028` no se reintenta a ciegas; solo se reintentan colisiones idempotentes y conflictos de serialización acotados.

## Pendiente externo

1. Revocación de una fuente durante análisis B5 y validación `SOURCE_REVOKED`.
2. Lector de pantalla y dispositivo físico.
3. Ensayo de rollback por flags y observabilidad de staging.
