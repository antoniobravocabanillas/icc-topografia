# Arquitectura de escritura móvil de jornadas

Fecha: 20 de octubre de 2026
Estado: decisión técnica previa a implementación
Alcance: profesional Flutter; no aplica DDL, no habilita endpoints y no modifica datos.

## Decisión

La lectura de jornadas puede operar con el token revocable del portal. La entrada y salida no deben reutilizar un POST convencional ni considerar la IP como identidad del dispositivo.

La escritura se divide en dos capacidades:

1. **Marcación online autenticada**. La aplicación obtiene una operación desafiante de corta vida, firma la intención con una credencial ligada al usuario y confirma la operación con una clave idempotente estable.
2. **Telemetría diferida**. Después de recibir el identificador confirmado de la entrada, la aplicación puede conservar muestras de ubicación en una cola cifrada y sincronizarlas por lotes idempotentes. Una muestra offline nunca crea por sí sola una entrada o salida legal.

El endpoint web actual de `field-verification` consume un desafío WebAuthn una sola vez, pero no conserva un recibo consultable asociado a una clave de operación. Ante pérdida de respuesta, el cliente no puede distinguir un commit exitoso de un rechazo y repetir la firma no es seguro. Por eso no se conectará Flutter a ese flujo hasta introducir un recibo durable.

## Invariantes

- Un usuario y workspace sólo pueden tener una jornada aceptada abierta.
- La transición esperada se deriva en el servidor: `CHECK_IN` cuando no existe una entrada abierta; `CHECK_OUT` cuando existe una.
- `operationKey` es aleatoria, de 128 bits, inmutable y única por usuario/workspace.
- El servidor congela un fingerprint del comando; repetir la misma clave con otro payload devuelve conflicto.
- La recepción incierta se resuelve con GET por `operationKey`; nunca con un POST automático.
- Entrada, salida, recibo y aprobación calculada se confirman dentro de una transacción serializable.
- La hora legal es `capturedAt` del servidor. La hora del dispositivo se conserva sólo como evidencia acotada y señal de riesgo.
- La ubicación exacta permanece privada al workspace. Los listados devuelven únicamente estados y etiquetas necesarias.
- IP y user-agent son señales de riesgo HMAC, no credenciales ni bloqueos de identidad. Cambiar de navegador no impide cerrar una jornada autenticada.
- La cola local se cifra con almacenamiento seguro, se separa por workspace/usuario/epoch y se elimina al cerrar sesión o cambiar de cuenta.
- Las muestras usan `clientSampleId` único; el servidor conserva la unicidad `(attendanceEventId, clientSampleId)`.

## Contrato propuesto

### Preparar

`POST /api/public/workspaces/{workspace}/portal/attendance/operations`

Entrada estricta:

```json
{
  "operationKey": "32 caracteres hex",
  "intent": "CHECK_IN",
  "context": "PROJECT | PERSONAL_FIELD",
  "projectId": "id o null",
  "location": {
    "latitude": -12.0,
    "longitude": -77.0,
    "accuracyMeters": 18,
    "capturedAt": "ISO-8601 con offset"
  }
}
```

Respuesta: identificador opaco de operación, transición derivada por servidor, desafío de autenticación, vencimiento y fingerprint público del payload. No crea asistencia.

### Confirmar

`POST /api/public/workspaces/{workspace}/portal/attendance/operations/{operationKey}/confirm`

Entrada: respuesta firmada y el fingerprint recibido. El servidor bloquea el estado de jornada, revalida membresía, relación, proyecto, precisión y geocerca, consume el desafío y persiste evento más recibo atómicamente.

### Reconciliar

`GET /api/public/workspaces/{workspace}/portal/attendance/operations/{operationKey}`

Estados externos: `PREPARED`, `APPLIED`, `REJECTED`, `EXPIRED`, `UNKNOWN`. `APPLIED` devuelve sólo `attendanceId`, tipo, contexto y `capturedAt`.

## Persistencia requerida, aún no aplicada

Se requiere una tabla de operaciones de asistencia con:

- `id`, `userId`, `workspaceId`, `operationKey`;
- `fingerprint`, `intent`, `state`;
- `challengeId` y `attendanceEventId` opcionales;
- `preparedAt`, `expiresAt`, `appliedAt`, `createdAt`, `updatedAt`;
- unicidad `(userId, workspaceId, operationKey)`;
- FK del evento con conservación del recibo histórico según la política de retención.

El evento de asistencia no debe recibir `operationKey` directamente: el recibo separado permite conservar idempotencia, rechazo y reconciliación sin mezclar estados fallidos con hechos laborales aceptados.

## Dispositivo nativo y offline

WebAuthn está diseñado alrededor de RP ID y origen web. Para Flutter nativo hay dos caminos válidos que requieren decisión explícita antes de codificar:

- usar passkeys mediante asociación de dominio/aplicación y credenciales compatibles con el backend actual;
- registrar una clave de instalación generada en hardware seguro, con attestation cuando exista, y firmar comandos canónicos.

No se adoptará IP, user-agent ni un UUID almacenado como sustituto criptográfico. Tampoco se permitirá crear una jornada completamente offline hasta definir una ventana de aceptación, protección contra rollback del reloj, nonce/contador monotónico y política empresarial de revisión. En la primera versión, estar offline durante una jornada confirmada sólo difiere las muestras y bitácoras; entrada y salida requieren conexión.

## Secuencia ejecutable siguiente

1. Elegir passkey nativa o clave de instalación y documentar amenazas/recuperación.
2. Preparar migración y verificador rollback-only para el recibo idempotente; no aplicarla.
3. Implementar servicio transaccional y contratos puros con pruebas de replay, payload distinto, doble confirmación, respuesta perdida y cambio de sesión.
4. Exponer rutas sólo después del gate de esquema.
5. Implementar cliente Flutter y cola cifrada; mantener marcación deshabilitada hasta cerrar pruebas Android reales.

## Riesgos detectados en el flujo web existente

- El desafío consumido impide replay, pero no ofrece reconciliación por operación ante respuesta perdida.
- La selección del último evento aceptado no equivale a un bloqueo durable de “una jornada abierta”; dos operaciones preparadas pueden competir y deben serializarse con un registro de operación o lock explícito.
- La propiedad del tracker basada en fingerprint de user-agent es demasiado frágil para Flutter y cambios de navegador; debe migrar a identidad criptográfica de instalación.
- Los eventos de precisión/geocerca rechazada se persisten antes de autenticación. Son útiles para auditoría, pero deben tener retención y límites para evitar spam de filas.
