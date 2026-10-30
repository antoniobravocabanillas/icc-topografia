# Gate remoto de plataforma con secretos de staging

## Alcance

Transporte alternativo al archivo local ausente: Netlify ejecuta las mismas
pruebas HTTPS/Playwright/PostgreSQL usando sus secretos existentes. No extrae
secretos, no cambia contrasenas, no usa Daybreak ni requiere migraciones.

- Sitio exclusivo: `6b8c43fb-6083-450a-9b85-46a820fb6358`.
- Rama exclusiva: `codex/platform-staging-release`.
- Supabase: `mghdpciewbsowjrjwmwk`, rol `terraqo_staging_runtime`.
- La rama `codex/icc-production-preview` sigue siendo productiva: no publicar
  estos cambios alli hasta cerrar el gate de salida.

## Controles

El plugin local solo actua en el sitio aislado. Antes del build exige contexto
principal de staging, HEAD igual a COMMIT_REF y al SHA autorizado, consentimiento
exacto por fase, flags/cohorte previstos y DATABASE_URL igual a la URL validada
de los fixtures. Rechaza dotenv locales. Genera una identidad publica minima
(sitio, commit, deploy); antes y despues de cada prueba verifica que el sitio
publicado corresponda a ese mismo candidato.

Los hijos reciben un entorno con claves permitidas, sin token de despliegue,
credenciales de pagos, NODE_OPTIONS ni proxies heredados. No se imprime salida
cruda de pruebas: solo resultado, duracion, ubicaciones de codigo y codigos de
error conocidos. Los fixtures conservan sus comprobaciones de destino, base
vacia y limpieza. Un fallo detiene la fase, sin reintento automatico.

`onSuccess` se ejecuta despues de publicar staging. No evita esa publicacion ni
constituye una aprobacion de produccion. El resultado debe combinarse con un
readback independiente del ledger, limpieza de fixtures y deploy/commit.

## Fases

1. `b1-b3`: cuatro primeros flags, cohorte vacia, proveedor off. Ejecuta B1/B2
   y B3 secuencialmente sobre el mismo candidato.
2. `b4`: ocho flags, workspace sintetico `cm00000000000000000000001`, proveedor
   off, B5 desactivado. Ejecuta B4 y B5 readiness.
3. `b5-dispatch`: ocho flags, cohorte vacia, B5 desactivado, proveedor Groq y
   secreto dedicado/configurado. Ejecuta el fixture acotado de dispatcher.

Controles de build: `PLATFORM_STAGING_CANDIDATE_SHA`,
`PLATFORM_STAGING_CLOUD_PHASE` y `PLATFORM_STAGING_CLOUD_CONFIRM` con valor
`mghdpciewbsowjrjwmwk:<fase>:synthetic-only`. Cada fase exige un despliegue
con su configuracion real; no se simulan flags diferentes solo en el cliente.

## Validacion local

TypeScript, ESLint, contrato del transporte remoto y 43 controles locales
aprobados. El contrato rechaza sitio/DB/rama/commit ajenos, marcadores servidos
obsoletos, consentimientos incompletos y filtrado incorrecto de credenciales.
Se comprobo que el plugin no inicia procesos en produccion.

Readback previo: 43 migraciones completas; cero usuarios, workspaces o jobs.
El sitio anterior sigue publicado mientras no finalice el primer build remoto.
La configuracion Git de staging estaba vacia; produccion solo admite su rama
principal como branch deploy. Las ejecuciones remotas y su evidencia se agregan
al cierre de cada fase. Esto no declara cerrado el lanzamiento.

## B1-B3 aprobado

Candidato `3c230a1d2df1f4cd70cb44996a3d0a461fc5920b`, deploy de staging
`6ae4e73dbd4d5db6f8e437e0`, build `6ae4e73dbd4d5db6f8e437de`.
El build completo, escaneo de secretos y verificacion posterior aprobaron.
B1/B2: 107170 ms; B3: 245415 ms; resultado final del plugin
`Staging cloud verified PASS: phase=b1-b3`.

B3 comprueba tres identidades, dos workspaces, idempotencia, proyeccion por
campos, expiracion y revocacion de grants/proyecciones, rechazo de publicacion
empresarial, conflictos de respaldo y reevaluacion de autoridad empresarial.
La consulta independiente posterior confirma cero usuarios, workspaces,
selecciones, grants y solicitudes de respaldo. No hubo migraciones.

El candidato previo `40945dc` habia aprobado B1/B2 pero no llego a B3 por un
fallo de transporte al consultar el marcador despues del proceso sincronico.
Los hijos ahora se ejecutan de forma asincrona, manteniendo vivo el event loop.
Solo el GET idempotente de identidad admite tres intentos de transporte; un
HTTP erroneo o candidato distinto falla inmediatamente. Las escrituras de
fixtures no se reintentan. Esto no relaja ninguna asercion funcional.

El transporte cloud resuelve el bloqueo del archivo local ausente: no hace
falta recuperar ni rotar la contrasena PostgreSQL para estos gates.
