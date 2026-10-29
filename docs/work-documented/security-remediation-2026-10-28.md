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

4. **Límite de Server Actions y evidencias profesionales**
   - El límite global bajó de `50mb` a `4mb`; las evidencias ya no atraviesan Server Actions como binarios.
   - El cliente divide cada archivo en fragmentos binarios de 3 MB y usa Route Handlers autenticados. El contrato funcional sigue admitiendo hasta seis archivos de 8 MB.
   - Cada manifiesto y recibo está firmado con HMAC, vinculado al usuario, al upload y a su vencimiento. Los fragmentos son inmutables e idempotentes y se verifican por SHA-256.
   - Las imágenes se decodifican y regeneran como WEBP; los PDF validan firma y terminador antes de persistirse.
   - Un presupuesto temporal persistido limita a 64 MB las cargas incompletas por usuario. Conserva el tamaño fuente mientras existan fragmentos, registra la clave final antes de escribirla y recupera huérfanos vencidos sin borrar referencias vivas.
   - La cuota retenida se carga y el presupuesto temporal se consume en la misma transacción serializable que crea las filas de evidencia. El lock de perfil/experiencia, el piso compartido y la clave única evitan carreras, doble cobro y reutilización entre experiencias.
   - Los formularios envían únicamente recibos firmados al Server Action; los binarios grandes quedan fuera de ese canal.

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
- `npm run test:experience-evidence-chunk-upload`: aprobado tres veces consecutivas, incluido cleanup estable en Windows.
- `node --conditions=react-server --import tsx scripts/test-portal-experience-evidence.ts`: aprobado.
- `npm run test:terraqo-local-contracts`: aprobado; 35 comprobaciones no mutantes, incluido el nuevo contrato de carga.

## Evidencia remota de staging

- Deploy exclusivo de staging: `6ae2827588750df4a49f8bc4`.
- URL canónica: `https://terraqo-platform-staging.netlify.app`.
- Smoke no mutante: `/api/health` 200, `/cuenta` 200 con formulario de acceso, registro inválido 422 y passkey inválida 400.
- El recorrido autenticado del control de correo queda pendiente: el conector Supabase permitió la lectura agregada, pero rechazó crear la fixture en `icc.User`; la credencial runtime permanece protegida en Netlify y no se extrajo. No se dejaron datos sintéticos.
- El flujo de carga fragmentada todavía debe desplegarse y ejercitarse en staging con una cuenta profesional aislada antes de promoverse. La compilación local confirma las dos rutas nuevas, pero no sustituye el recorrido autenticado contra Blobs y PostgreSQL de staging.

## Restricciones vigentes

- Sin despliegue a producción.
- Sin migraciones ni cambios de datos.
- Sin activación de B5 ni proveedor de IA.
- El deploy de staging, si se ejecuta, debe mantener B5 apagado y pasar nuevamente los gates HTTP autenticados aplicables.
