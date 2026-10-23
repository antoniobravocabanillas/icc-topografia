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
- El ledger Prisma contiene 43 migraciones completas, sin entradas incompletas
  ni revertidas.
- El esquema `public` no contiene tablas.
- El Advisor reporta RLS deshabilitado en `icc`; el esquema no concede `USAGE`
  ni permisos de tabla a `PUBLIC`, `anon`, `authenticated` o `service_role`, y
  no esta previsto exponerlo al Data API. No se habilito RLS sin politicas.
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
- El runner v2 con proceso PostgreSQL controlado directamente aprobo el ensayo
  desechable: 43 entradas Prisma completas, siete migraciones B1-B5, seis
  objetos clave, indice GIN valido/listo, cero filas de aplicacion y solo los
  dos artefactos full-text de drift esperados. El cluster se detuvo y limpio.
- El baseline y las siete migraciones se promovieron despues al destino remoto
  usando el Session pooler oficial `aws-1-sa-east-1.pooler.supabase.com:5432`.
- La verificacion remota confirmo ledger `43:43:0`, seis objetos clave, GIN
  valido/listo, cero filas de aplicacion, `public` sin tablas y solo los dos
  artefactos full-text de drift esperados.

## Configuracion no secreta del gate

```dotenv
PLATFORM_STAGING_CONFIRM=staging
PLATFORM_STAGING_ALLOW_REMOTE=true
PLATFORM_STAGING_DATABASE_PROVIDER=supabase
PLATFORM_STAGING_RESOURCE_NAME="Terraqo Platform Staging"
PLATFORM_STAGING_SUPABASE_PROJECT_REF=mghdpciewbsowjrjwmwk
PLATFORM_STAGING_DATABASE_ROLE=terraqo_staging_migrator
B5_GATE_EXPECTED_DATABASE=postgres
```

El rol esperado tambien quedo registrado como variable no secreta en el sitio
Netlify aislado `terraqo-platform-staging`; el sitio continua sin Git, sin
deploy y con los flags de producto y proveedores externos apagados.

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

El destino esta reservado, identificado y migrado, pero permanece sin datos de
aplicacion. Esta evidencia no autoriza despliegue. Estado del gate:

1. [Completado] Credencial migradora exclusiva, rotada y deshabilitada al cierre.
2. [Completado] Ensayar el baseline y las migraciones en PostgreSQL desechable.
3. [Completado] Preflight remoto con flags apagados, proveedor IA `off`, cohorte
   vacia y URLs HTTPS exclusivas de staging.
4. [Completado] Baseline, 36 resoluciones historicas y siete migraciones B1-B5.
5. [Completado] Ledger, objetos, GIN, cero filas y drift remoto.
6. [Completado] Rol runtime con `USAGE` y DML sobre `icc`, sin `CREATE`, probado
   por conexion directa y transaction pooler. `DATABASE_URL` esta guardada como
   secreto solo en Netlify staging; el migrador permanece `NOLOGIN`.
7. Pendiente: despliegue de la revision candidata y E2E sintetico.

No se reutiliza el proyecto `Terraqo`; su nombre no declara staging y pertenece
a una superficie distinta.
