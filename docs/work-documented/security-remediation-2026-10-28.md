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
   - La transacción interactiva reserva hasta 5 segundos para abrirse y 20 segundos para completar el cálculo de almacenamiento remoto. El límite corrige el `P2028` reproducido en Supabase sin relajar serialización, ownership ni atomicidad.
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
- `npm run test:terraqo-local-contracts`: aprobado; 37 comprobaciones no mutantes, incluidos los contratos de carga, alcance de portada y origen confiable de callbacks.

## Evidencia remota de staging

- Revisión desplegada: `0979d71` (`fix: allow remote evidence transaction window`).
- Deploy exclusivo de staging: `6ae424f68bb42eedf27df92e`.
- Revisión posterior de portada: `909131e` (`fix: decouple professional portal from public workspace`).
- Deploy vigente de staging: `6ae42ae7786a4cd557f6fad4`.
- Guard de superficies públicas: `f8243f3`; exige que Site, Portal, Admin, API y Auth compartan el host aislado de staging.
- Revisión vigente de callbacks: `62d3f73` (`fix: isolate trusted callback origins`), deploy `6ae42f40f8d72f7d408e28b7`.
- URL canónica: `https://terraqo-platform-staging.netlify.app`.
- Smoke no mutante posterior al deploy: `/api/health` 200 y `/cuenta` 200.
- Recorrido autenticado real: inicialización 200, fragmento 200, finalización 200 y Server Action final 303 hacia `/portal/experiencias?success=experience`.
- Lectura posterior en PostgreSQL: una experiencia, una evidencia PDF de 603 bytes, cuota retenida en 1 MB y cero reservas activas para el upload exitoso.
- La tarjeta renderizada muestra el PDF adjunto y la revisión visual no detectó pérdida del formulario, evidencia ni estado. Los logs de funciones de los cinco minutos posteriores no registraron errores ni un nuevo `P2028`.
- Los dos objetos de Blobs del intento fallido anterior se eliminaron por clave exacta. El store conserva únicamente el objeto referenciado por la evidencia exitosa.
- El conector Supabase conserva permisos de solo lectura sobre `icc`; por ello una cuenta sintética, la experiencia huérfana del primer fallo y la experiencia exitosa siguen como fixtures identificadas. No se intentó ampliar permisos ni extraer la credencial runtime.
- El login por credenciales con una cuenta de correo marcado como verificado quedó aprobado. La entrega real de correo continúa fuera de alcance mientras el kill switch de correo de staging permanezca apagado.
- La portada `/portal` quedó desacoplada del workspace comercial público para perfiles profesionales: el recorrido autenticado carga el cockpit, `/portal/experiencias` conserva la experiencia y su PDF y la consola reporta cero errores y cero warnings. El portal cliente mantiene la resolución obligatoria de su tenant.
- Los redirects de verificación y cambio de correo fueron probados con tokens inválidos y resuelven al host de staging. El guard rechaza hosts no confiables, fuerza HTTPS fuera de localhost y elimina puertos públicos inyectados. OAuth sigue exponiendo solo `credentials`.
- El asesor de seguridad de Supabase devolvió cero lints en este corte. Aun así, debe confirmarse en Dashboard que `icc` no esté incluido entre los schemas expuestos por Data API; no se habilitará RLS de forma masiva sin diseñar políticas y grants.

## Estado cuantificado

- Preparación técnica del candidato antes de producción: **96 %**.
- El porcentaje no constituye autorización de publicación. El `HOLD` continúa por limpieza runtime de fixtures, B5 activo/observabilidad/dispatcher, accesibilidad en dispositivo físico y firmas operativas.

## Restricciones vigentes

- Sin despliegue a producción.
- Sin migraciones ni cambios de datos.
- Sin activación de B5 ni proveedor de IA.
- El deploy de staging mantiene B1-B4 activos, B5 apagado, proveedor IA `off`, OAuth apagado y correo transaccional apagado.
