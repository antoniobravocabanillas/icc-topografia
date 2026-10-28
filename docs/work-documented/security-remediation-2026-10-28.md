# Remediación de seguridad del candidato de plataforma — 28 de octubre de 2026

## Alcance

Remediación posterior al escaneo sellado `813a5bcb-0810-41fa-aea9-b5016243ebed` sobre el candidato B1–B5. No se ejecutaron migraciones, cobros, proveedores externos ni operaciones sobre producción.

## Controles cerrados

1. **Propiedad del correo en accesos con credenciales**
   - Password y passkey de Auth.js exigen `User.emailVerified` sin depender de rol ni de la vigencia del token.
   - El login independiente de workspace aplica la misma política antes de emitir su sesión revocable.
   - OAuth conserva su ciclo de identidad propio y no atraviesa la política de credenciales Terraqo.
   - El alta pública de postulantes ahora crea y envía el enlace de verificación que necesita la nueva invariancia.

2. **Replay concurrente de passkey**
   - El challenge de login se reclama con compare-and-set sobre `id`, `purpose=LOGIN`, `consumedAt=null` y vigencia.
   - Claim, contador del autenticador y rotación del token se confirman en una transacción serializable.
   - Una segunda ejecución concurrente no actualiza credencial ni emite token.

3. **Abuso de altas públicas**
   - Registro general y postulación pública reservan presupuestos atómicos antes de bcrypt y aprovisionamiento.
   - Presupuesto por red: 8 intentos cada 15 minutos.
   - Presupuesto por correo: 3 intentos cada 15 minutos.
   - Los scopes persistidos son HMAC; no almacenan correo ni IP en claro.
   - En producción solo se confía en `x-nf-client-connection-ip`; la cadena forwarding no se usa como identidad de red si falta la señal del edge de Netlify.

## Hallazgo retenido

El límite global de Server Actions permanece en `50mb`. Reducirlo a `4mb` rompía un contrato real: experiencias profesionales aceptan hasta seis evidencias de 8 MB. La corrección segura requiere mover cargas binarias grandes a Route Handlers dedicados o carga directa firmada, con límite temprano, cuotas, validación MIME y almacenamiento compensable. Este trabajo queda como gate previo a cerrar `availability.server-action-body-limit`; no debe resolverse reduciendo el límite global mientras exista el flujo actual.

## Compatibilidad y rollout

- La base exclusiva de staging `Terraqo Platform Staging` devolvió cero cuentas con contraseña; no existe impacto de bloqueo en ese entorno.
- Antes de producción se debe inventariar `passwordHash IS NOT NULL AND emailVerified IS NULL`, clasificar altas administrativas legítimas y activarles un proceso de verificación o una aprobación operativa auditable. No se ejecutó backfill.
- El segundo revisor automático no pudo completar por límite de uso del servicio. Se realizó una revisión independiente local de callers, estados alternos y regresiones; esta limitación queda registrada y no se presenta como cobertura automatizada.

## Verificación ejecutada

- `npm run test:auth-security-controls`: aprobado.
- `npm run test:portal-login-limit`: aprobado.
- `npm run test:auth-secure-proxy`: aprobado.
- `npm run test:oauth-provider-policy`: aprobado.
- `npm run check:release-candidate`: aprobado.
- `npm run lint`: aprobado sin warnings.
- `npm run typecheck`: aprobado.
- `npm run build`: aprobado.
- `npm run test:terraqo-local-contracts`: aprobado; el nuevo contrato queda incorporado al gate consolidado para las siguientes ejecuciones.

## Evidencia remota de staging

- Deploy exclusivo de staging: `6ae2827588750df4a49f8bc4`.
- URL canónica: `https://terraqo-platform-staging.netlify.app`.
- Smoke no mutante: `/api/health` 200, `/cuenta` 200 con formulario de acceso, registro inválido 422 y passkey inválida 400.
- El recorrido autenticado del control de correo queda pendiente: el conector Supabase permitió la lectura agregada, pero rechazó crear la fixture en `icc.User`; la credencial runtime permanece protegida en Netlify y no se extrajo. No se dejaron datos sintéticos.

## Restricciones vigentes

- Sin despliegue a producción.
- Sin migraciones ni cambios de datos.
- Sin activación de B5 ni proveedor de IA.
- El deploy de staging, si se ejecuta, debe mantener B5 apagado y pasar nuevamente los gates HTTP autenticados aplicables.
