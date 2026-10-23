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

$env:PLATFORM_STAGING_REHEARSAL_CONFIRM='rehearse-pre-b1-baseline'
npm run rehearse:platform-staging-baseline

El destino Supabase 17.11 fue inicializado sin filas de aplicacion. La credencial
de migracion fue temporal, exclusiva de staging y quedo revocada al cerrar el
gate. Nunca se guardo en Git, Flutter, variables
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

Estado del 23 de octubre de 2026: el runner v2 controla directamente
el proceso PostgreSQL y aprobo en una sola ejecucion 36 resoluciones historicas,
siete migraciones B1-B5, ledger `43:43:0`, seis objetos clave, GIN valido/listo,
cero filas y el drift full-text esperado. El mismo flujo se ejecuto luego sobre
Supabase staging por el Session pooler oficial: baseline atomico, 36
resoluciones historicas, siete migraciones B1-B5 y drift aprobado. `public`
continua sin tablas y todas las tablas de `icc`, salvo el ledger Prisma, tienen
cero filas. El login migrador quedo deshabilitado.

El rol runtime autentico, pero el primer ciclo de grants no dejo ACL efectivos
sobre `icc`; por seguridad no se publico esa credencial. El sitio Netlify
aislado conserva una `DATABASE_URL` inalcanzable que hace fallar cerrado hasta
resolver y verificar los permisos DML sin DDL.
