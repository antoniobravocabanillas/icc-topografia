# Verificación operativa del esquema de bitácoras

El código Android está en `C:/Users/Binv/Documents/ICC TOPOGRAFIA/terraqo_mobile`.
Este backend mantiene la preparación de bitácoras nativas. La existencia del
schema Prisma o de pruebas locales no acredita aplicación de tablas en el proveedor.

Continuación del 15 de octubre de 2026: preflight y ensayo rollback reales
aprobados. El snapshot runtime usa transacción de lectura de 15 s y la guarda de
workspace dentro de ella; dejó de aparecer P5000. Las conexiones usan roles
distintos: se compara la misma base/catálogo/extensiones/ledger y se conserva
el baseline completo de cada principal por separado. El diagnóstico no expone
sus nombres. `search_path=icc,pg_catalog` fija la representación del catálogo.

Bootstrap específico aplicado con commit y comprobación posterior aprobada en
ambas conexiones: catálogo exacto, cinco tablas, 36 constraints y 16 índices;
baseline anterior y ledgers conservados. No se ejecutó `migrate deploy`, ni
adjudicación, ni modificaciones a clientes/planes/módulos/fondos reales.
HTTP local sobre SQL aislado aprobado antes y después de esa aplicación:
JWT/grant real, replay concurrente, conflicto, GET null sin escritura, esquema
alterado rechazado y revocación/democión. Cero puntos aplicados y fixtures ausentes.
La publicación y el recorrido HTTPS se registran por separado.

## Consulta sin DDL

Desde la raíz de este backend:

```powershell
python scripts/check-native-worklog-bootstrap.py --preflight
```

Sin argumentos también usa exclusivamente el preflight. Resuelve la conexión
runtime de Netlify production/functions en memoria y la conexión directa de
`.env`; no imprime URLs ni diagnósticos del driver. Compara inventario y dos
snapshots de catálogo, identidad y ledgers, antes y después. Los snapshots se
leen en transacciones REPEATABLE READ, READ ONLY. Rechaza esquema parcial,
huella distinta, conexión incoherente o cambio del baseline. El resultado
`expected_fingerprint` indica el catálogo esperado, no que esté instalado.
`initial_state: absent` confirma ausencia en las lecturas realizadas.

## Ensayo con rollback

Requiere una ventana de mantenimiento que excluya migraciones y creación o
accounting nativos concurrentes. El advisory lock sólo serializa callers que
usan el mismo protocolo; no sustituye ese control operativo. Los locks sobre
tablas padre pueden esperar o bloquear escrituras durante el ensayo.

```powershell
python scripts/check-native-worklog-bootstrap.py --check
```

Sólo tras coincidir ambas conexiones, el hijo compara de nuevo el baseline,
ejecuta las cinco migraciones inmutables con hashes fijados y fuerza rollback
de la transacción completa. Lock timeout 5 s, statement timeout 10 s,
transacción de mantenimiento 30 s. No crea usuarios, bitácoras ni créditos;
no modifica el ledger Prisma. Nunca ejecuta `migrate deploy` general.

El padre vuelve a consultar ambas conexiones y los ledgers incluso si el
hijo falla o pierde la respuesta. Un fallo de verificación es un resultado
incierto: requiere inspección, sin reintento automático. El timeout del
subproceso no acredita cancelación física del driver ni rollback confirmado.

El checker rechaza `--apply`. La aplicación permanente tiene su entrada separada:

```powershell
python scripts/apply-native-worklog-bootstrap.py --apply --expected-baseline BASELINE_DEL_PREFLIGHT --maintenance
```

Exige baseline directo exacto y mantenimiento explícito. Repite preflight,
aplica exclusivamente los cinco archivos fijados en una transacción y comprueba
ambas conexiones después del commit. El catálogo exacto existente no repite DDL.
Una respuesta perdida se declara incierta, se consulta el estado y no se reenvía
automáticamente. Las pruebas controladas del aplicador no sustituyen SQL real.

## Regresión de la orquestación

```powershell
python scripts/test-native-worklog-bootstrap-check.py
python scripts/test-native-worklog-bootstrap-apply.py
npx eslint scripts/check-native-worklog-bootstrap.ts --max-warnings=0
npm run typecheck
```

Las pruebas Python usan puertos controlados y no acceden a credenciales, SQL ni
proveedores. Cubren preflight, ensayo único, catálogo exacto/ausente, drift,
resultado inválido, timeout, comprobación de ambas conexiones tras fallo y
rechazo de `--apply` en el checker. 14 casos del checker y 8 del aplicador
aprobados. No sustituyen el ensayo SQL del proveedor.

## Endpoint nativo

`GET/POST /api/public/workspaces/{workspaceSlug}/portal/native-worklogs` usa
composición fija, token profesional con grant obligatorio y comprobación de
catálogo dentro de cada transacción antes del core. El POST acepta exclusivamente
los siete strings del contrato `native-worklog-payload.ts`, hasta 16 KiB.
Creación privada, recibo, decisiones, autoridad, PENDING y auditoría se guardan
juntos; el endpoint no ejecuta adjudicación. GET usa sólo `operationKey` y nunca
crea registros. Un null no acredita ausencia definitiva ni autoriza reenvío automático.

Pruebas HTTP reales en loopback con PostgreSQL17 aislado: dos solicitudes
concurrentes producen un recibo y una auditoría; replay idéntico, conflicto409,
legacy401, esquema alterado503 y democión/revocación401. Fixtures eliminados,
clúster detenido y directorio propio retirado. Se repitió por el cambio del gate
usando exportación schema-only del origen ya aplicado, con cero filas importadas.
No se alteró DDL de origen durante esa repetición.

Build Next PASS con 23 advertencias preexistentes fuera de los archivos del bloque.
TypeScript y lint focalizado aprobados. La prueba publicada se ejecuta con
`python scripts/test-deployed-native-worklog.py`: destino HTTPS y workspace/RUC
fijos, firma runtime en memoria, dos usuarios nuevos propios y limpieza ordenada
tras revocación. No modificar módulos/planes, lanzar accounting global ni usar
usuarios existentes para esta prueba.
