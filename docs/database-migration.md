# Preparación de migración a Supabase

Destino elegido: Terraqo `tmlpiacfbvljfphejxmi`. Producción sigue en Prisma Postgres 17.2 mediante Accelerate. Preparación verificada el 6 de octubre de 2026, Lima; no hubo cambios de runtime ni de la conexión publicada.

`scripts/inventory-database-migration.py` resuelve DATABASE_URL de Netlify en memoria y lo compara con la conexión directa de `.env`. La comparación normaliza el search_path para los defaults enum. Verificó 1.412 columnas, el catálogo de objetos y la huella de empresas coincidentes; no imprime filas ni identificadores de usuarios.

`scripts/rehearse-database-migration.py` usa un snapshot exportado de solo lectura para el dump y las huellas SHA-256, valida TLS con hostname/cadena de confianza, cifra con AES-256-GCM y protege la clave mediante DPAPI. PostgreSQL 18.4 está instalado en `C:\Program Files\PostgreSQL\18\bin`. El ensayo local privado tiene contraseña SCRAM aleatoria; se detiene al finalizar. Sus clientes reciben contraseñas mediante el entorno, nunca argumentos.

Resultado: 112 tablas, 1.459 filas, 480 índices, 350 restricciones; hashes y definiciones coincidentes, incluyendo nulabilidad, defaults, enumeraciones y secuencia. PostgreSQL 18 registra NOT NULL en pg_constraint; el conteo comparado excluye esa categoría y verifica nulabilidad por separado. [Referencia oficial](https://www.postgresql.org/docs/18/catalog-pg-constraint.html).

Respaldo verificado: `C:\Users\Binv\.terraqo-private\migration-20261007T010858Z`. El manifest y el archivo cifrado están fuera de Git, con ACL restringida al usuario y SYSTEM. SHA-256 recuperado: `855d8a6ca4dc405de05efdfc53ea26e370fc410326bfe3ab401da9487f05e849`. DPAPI está ligado al usuario/equipo; falta verificar una copia recuperable fuera del equipo antes del corte.

```powershell
python scripts/inventory-database-migration.py > tmp/migration-inventory.json
python scripts/rehearse-database-migration.py
python scripts/inspect-migration-archive.py C:\Users\Binv\.terraqo-private\migration-20261007T010858Z
```

El destino Supabase 17.11 sigue vacío. El MCP operativo no entrega una contraseña PostgreSQL para pg_restore. Configurar la conexión exacta de **Connect → Session pooler** como `SUPABASE_MIGRATION_DATABASE_URL` en `.env.local` ignorado, sin modificar aún DATABASE_URL. Nunca ponerla en Git, Flutter, NEXT_PUBLIC ni chat. Si hay que cambiar una contraseña desconocida, el propietario completa esa operación en el panel.

Antes del corte: restauración y comparación en Supabase 17, permisos privados de icc, rol de backend sin DDL, RLS compatible con las identidades actuales Auth.js, respaldo de archivos externos Netlify Blobs, pruebas reales desde Netlify, recuperación/revocación de sesiones y prueba de copia fuera del equipo. Un respaldo SQL no incluye los bytes de Netlify Blobs. La pausa de escrituras, el dump final y la reversión deben evitar pérdida de nuevas transacciones; no activar dos bases de escritura.

El primer ensayo tuvo un problema de pipes heredados al arrancar PostgreSQL; el helper ya usa salida desacoplada para el daemon. El clúster vacío de aquel intento está detenido en la carpeta privada y su archivo se convirtió a formato cifrado. Los ensayos completos posteriores detuvieron y limpiaron sus clústeres.
