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

## Estado y siguiente gate

El destino esta reservado e identificado, pero permanece vacio. Esta evidencia
no autoriza migraciones ni despliegue. Antes de aplicar las siete migraciones
B1-B5 se debe:

1. Obtener y custodiar una credencial exclusiva de staging.
2. Preparar y ensayar la restauracion del baseline anonimizado compatible con
   el historial Prisma anterior a B1.
3. Ejecutar `npm run check:platform-staging` con flags apagados, proveedor IA
   `off`, cohorte vacia y URLs HTTPS exclusivas de staging.
4. Registrar respaldo, responsable, ventana, checksums y plan de rollback.

No se reutiliza el proyecto `Terraqo`; su nombre no declara staging y pertenece
a una superficie distinta.
