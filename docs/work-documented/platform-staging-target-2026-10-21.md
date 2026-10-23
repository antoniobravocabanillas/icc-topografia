# Destino PostgreSQL exclusivo de staging

Fecha de registro: 21 de octubre de 2026 (America/Lima).

## Identidad confirmada

| Campo | Valor |
| --- | --- |
| Proveedor | Supabase |
| Organizacion | `Vrilla SAC` |
| Plan observado | Free |
| Proyecto | `Terraqo Platform Staging` |
| Project ref | `mghdpciewbsowjrjwmwk` |
| Region | Sao Paulo (`sa-east-1`) |
| Host directo | `db.mghdpciewbsowjrjwmwk.supabase.co` |
| Base administrada | `postgres` |
| Motor | PostgreSQL 17 |
| Version observada | 17.11 |
| Estado | `ACTIVE_HEALTHY` |
| Coste cotizado | USD 0 mensual |

## Verificaciones realizadas

- La API de administracion devolvio la organizacion, nombre, project ref,
  region y host anteriores.
- Una consulta SQL de solo lectura confirmo `current_database() = postgres`,
  `current_user = postgres` y PostgreSQL 17.11.
- El historial de migraciones esta vacio.
- El esquema `public` no contiene tablas.
- Los advisors iniciales de seguridad y rendimiento no reportaron avisos.
- El contrato local reconoce tanto la conexion directa como el transaction
  pooler solo cuando contienen el project ref exacto.
- Un project ref, proveedor, nombre de recurso o base discordante falla antes
  de abrir una conexion.
- `npm run check:platform-staging` aprobo contra la identidad no secreta real
  usando una credencial efimera no funcional solo para validar la estructura;
  el script no abrio conexiones ni imprimio secretos.
- El baseline pre-B1 se genera sin filas desde el datamodel exacto del commit
  `e6ff153694dc01ab8a2b5848556fa6839626b2af`. El artefacto local ignorado pesa
  179.376 bytes y tiene SHA-256
  `047440ba921d38f9539821ce3a8ab8930b4f08e6e17a3c9398e796e6ced9c4b5`.
- El manifiesto separa 36 migraciones historicas y las siete migraciones B1-B5.
- La promocion remota permanece bloqueada: tres ciclos del arnes local
  llegaron al cierre de PostgreSQL, pero Windows mantuvo bloqueado el log del
  clúster temporal e impidio conservar una evidencia final verificable del
  ledger y del drift. No se aplico SQL en Supabase.

## Configuracion no secreta del gate

```dotenv
PLATFORM_STAGING_CONFIRM=staging
PLATFORM_STAGING_ALLOW_REMOTE=true
PLATFORM_STAGING_DATABASE_PROVIDER=supabase
PLATFORM_STAGING_RESOURCE_NAME="Terraqo Platform Staging"
PLATFORM_STAGING_SUPABASE_PROJECT_REF=mghdpciewbsowjrjwmwk
B5_GATE_EXPECTED_DATABASE=postgres
```

`B5_GATE_DATABASE_URL`, `AUTH_SECRET` y
`EVIDENCE_ANALYSIS_DISPATCH_SECRET` son secretos operativos. Deben generarse y
guardarse en el contexto de staging; no pertenecen a este documento, Git, logs
ni mensajes.

## Aplicacion Netlify aislada

El 22 de octubre de 2026 se creo, sin despliegue ni enlace al checkout, el sitio
Netlify `terraqo-platform-staging`:

- Site ID: `6b8c43fb-6083-450a-9b85-46a820fb6358`.
- URL reservada: `https://terraqo-platform-staging.netlify.app`.
- Plan observado: Free (`nf_team_dev`).
- Sin dominio personalizado, repositorio, CI ni deploy publicado por este gate.
- El checkout local permanece enlazado al sitio productivo historico; los
  comandos de staging deben incluir siempre el Site ID explicito.

Se configuraron la identidad no secreta de Supabase, URLs del sitio y los nueve
flags B1-B5 en `false`. El proveedor de analisis esta `off`, el proveedor IA
legacy en `none` y se generaron secretos exclusivos para Auth.js y el dispatcher
en el contexto `production` del sitio de staging.

Netlify hereda variables compartidas del equipo. Por eso staging exige
`TERRAQO_OAUTH_ENABLED=false` y
`TERRAQO_TRANSACTIONAL_EMAIL_ENABLED=false`: ambos controles se aplican en el
servidor y prevalecen aunque existan credenciales OAuth o Resend heredadas. No
se habilitaran hasta ejecutar pruebas sinteticas especificas.

## Estado y siguiente gate

El destino esta reservado e identificado, pero permanece vacio. Esta evidencia
no autoriza migraciones ni despliegue. Antes de aplicar las siete migraciones
B1-B5 se debe:

1. Obtener y custodiar una credencial exclusiva de staging.
2. Cerrar el ensayo local desechable y conservar evidencia de 43 entradas
   Prisma completas, seis objetos clave B1-B5, indice GIN valido, cero filas de
   aplicacion y solo los dos artefactos full-text de drift esperados.
3. Ejecutar `npm run check:platform-staging` con flags apagados, proveedor IA
   `off`, cohorte vacia y URLs HTTPS exclusivas de staging.
4. Registrar respaldo, responsable, ventana, checksums y plan de rollback.

No se reutiliza el proyecto `Terraqo`; su nombre no declara staging y pertenece
a una superficie distinta.
