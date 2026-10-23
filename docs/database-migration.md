# Preparación de migración a Supabase

Destino exclusivo: `Terraqo Platform Staging`, project ref
`mghdpciewbsowjrjwmwk`, organizacion `Vrilla SAC`, Sao Paulo (`sa-east-1`),
base `postgres`, PostgreSQL 17.11. El proyecto historico `Terraqo`
(`tmlpiacfbvljfphejxmi`) no declara aislamiento y no se usa para este rollout.
Produccion sigue en Prisma Postgres mediante Accelerate; no hubo cambios de
runtime, datos ni conexion publicada.

`scripts/inventory-database-migration.py` resuelve DATABASE_URL de Netlify en memoria y lo compara con la conexión directa de `.env`. La comparación normaliza el search_path para los defaults enum. Verificó 1.412 columnas, el catálogo de objetos y la huella de empresas coincidentes; no imprime filas ni identificadores de usuarios.

`scripts/rehearse-database-migration.py` usa un snapshot exportado de solo lectura para el dump y las huellas SHA-256, valida TLS con hostname/cadena de confianza, cifra con AES-256-GCM y protege la clave mediante DPAPI. PostgreSQL 18.4 está instalado en `C:\Program Files\PostgreSQL\18\bin`. El ensayo local privado tiene contraseña SCRAM aleatoria; se detiene al finalizar. Sus clientes reciben contraseñas mediante el entorno, nunca argumentos.

El respaldo privado de octubre contiene datos reales y queda excluido de
staging. No debe restaurarse, copiarse ni transformarse para este gate. El
baseline actual se reconstruye solo desde el datamodel pre-B1 y por tanto no
contiene filas, PII ni bytes de Netlify Blobs.

El respaldo historico permanece cifrado y fuera de Git como evidencia de
recuperacion del origen; no es una fuente autorizada para staging.

```powershell
$env:PLATFORM_STAGING_BASELINE_CONFIRM='generate-pre-b1-baseline'
npm run prepare:platform-staging-baseline
```

El comando de ensayo automatizado no se incorpora al candidato hasta sustituir
el lifecycle de `pg_ctl` en Windows y aprobar ledger, objetos, GIN, cero filas,
drift y limpieza en una sola ejecucion reproducible.

El destino Supabase 17.11 sigue vacio. Una credencial de migracion debe ser
temporal, exclusiva de staging y custodiada fuera de Git, Flutter, variables
`NEXT_PUBLIC_*`, logs y chat. Para migraciones se usa conexion directa o
Supavisor en modo session sobre puerto 5432; transaction pooling no es el
canal de migracion. `DATABASE_URL` de produccion no se modifica.

En una base vacia, el flujo reproducible es:

1. aplicar `output/platform-staging-baseline/pre-b1-baseline.sql` en una sola
   transaccion;
2. registrar mediante `prisma migrate resolve --applied` las 36 migraciones
   historicas cuyos objetos ya representa ese baseline exacto;
3. ejecutar `prisma migrate deploy` para las siete migraciones B1-B5;
4. exigir 43 entradas completas y sin `rolled_back_at`, indice GIN valido,
   cero filas de aplicacion y el gate de drift documentado.

`migrate resolve` se permite unicamente para esta inicializacion aislada y
checksummed. No se fabrican filas manuales en `_prisma_migrations`, no se usa
`db push` y no se resuelve ninguna migracion B1-B5.

Antes de cualquier despliegue: permisos privados de `icc`, mantener `icc`
fuera de los esquemas expuestos por Supabase Data API, rol de runtime sin DDL,
pruebas reales desde un entorno Netlify de staging, recuperacion/revocacion de
sesiones y validacion de blobs sinteticos. No activar dos bases de escritura.

Estado del ensayo del 22 de octubre de 2026: el baseline se genero dos veces con
el mismo hash. Tres ciclos del arnes desechable encontraron problemas de ciclo
de vida del proceso PostgreSQL en Windows (handles heredados y bloqueo del log
durante la limpieza). Los clústeres quedaron detenidos y sin credenciales
persistentes utilizables, pero no se obtuvo un reporte final verificable. El
gate remoto sigue en HOLD y Supabase staging no fue modificado.
