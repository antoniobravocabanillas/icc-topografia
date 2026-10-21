# Jornadas — continuidad de dispositivo y RP ID

Fecha: 19 de octubre de 2026.

## Problema corregido

El control de jornadas ya reconocía credenciales WebAuthn históricas creadas para `terraqoglobal.com`, pero el inicio de sesión con passkey consultaba únicamente el RP ID exacto del host actual. Una cuenta con credencial raíz podía aparecer como no vinculada al entrar por `portal.terraqoglobal.com` o `admin.terraqoglobal.com`, provocando activaciones repetidas.

## Contrato aplicado

- El host público exacto siempre tiene prioridad.
- En `portal.terraqoglobal.com` y `admin.terraqoglobal.com` se admite como fallback una credencial histórica de `terraqoglobal.com`; WebAuthn permite usar el dominio registrable padre desde esos subdominios.
- Una credencial específica de `portal.terraqoglobal.com` no se reutiliza en `admin.terraqoglobal.com` ni en dominios de clientes.
- El challenge persiste el RP ID realmente seleccionado y la verificación exige ese mismo valor y el origen público del navegador.
- Los hosts internos de Netlify nunca se convierten en RP ID; sin cabeceras públicas válidas se usa `https://portal.terraqoglobal.com` como fallback cerrado.

## Validación

- `npm run test:attendance-bootstrap`: proxy de producción, host interno oculto, preferencia exacta, fallback raíz y rechazo entre subdominios no compatibles.
- `npm run test:attendance-location-ownership`.
- `npm run test:attendance-tracker-lease`.
- `npm run typecheck`.
- ESLint focalizado y `git diff --check` aprobados.

No se aplicaron migraciones, no se desplegó y no se modificaron credenciales ni usuarios reales.
