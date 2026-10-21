# Gate de aislamiento de bitácoras — seguridad de ejecución

Fecha: 19 de octubre de 2026.

## Hallazgo

Los comandos de aislamiento no eran contratos puros. `test:worklog-isolation` buscaba el workspace `icc-topografia`, creaba una bitácora, evidencia y contribución, ajustaba puntos y después intentaba limpiar. Los gates de mensajería, reuniones, foros y equipos también crean recursos sobre identidades demo. El gate de almacenamiento crea usuarios, workspaces, notas y archivos dentro de una transacción que revierte al final. Ejecutarlos con la conexión normal podía modificar o bloquear datos reales.

## Corrección

El script ahora falla antes de importar Prisma salvo que reciba:

- `WORKLOG_ISOLATION_DATABASE_URL`: PostgreSQL local explícito;
- `WORKLOG_ISOLATION_EXPECTED_DATABASE`: nombre exacto confirmado;
- un nombre que contenga `gate`, `test` o `disposable`.

No acepta hosts remotos. La URL confirmada se asigna antes de cargar Prisma y los servicios de bitácora.

La política se valida sin conexión mediante `npm run test:local-disposable-database-guard`, cubriendo destino local válido, variables ausentes, host remoto, nombre distinto, nombre no desechable y protocolo incorrecto.

`npm run test:isolation-script-safety` inspecciona los seis runners locales, el gate visual B5 y el verificador desplegado del portal. Falla si alguno vuelve a importar Prisma antes de confirmar el destino o el consentimiento explícito.

`test:portal-deployed` no es una prueba local: consulta membresías del entorno configurado y crea un grant revocable temporal. Por eso ahora exige `TERRAQO_DEPLOYED_PORTAL_TESTS=temporary-session-grant` antes de cargar Prisma. Esta barrera no autoriza su ejecución; solo evita iniciarla por accidente.

Los cinco validadores mutantes ICC conservan su confirmación exacta `TERRAQO_MUTATING_TESTS=icc-topografia:20616116313`, pero ahora también la evalúan antes de importar Prisma. No forman parte de los gates locales y no se ejecutaron durante este endurecimiento.

La validación nativa HTTPS invocada por `scripts/test-deployed-native-worklog.py` también comprueba alcance, origen exacto y secreto antes de cargar persistencia o el módulo de sesiones. El wrapper sigue siendo la única entrada operativa documentada.

## Puerta local consolidada

`npm run test:terraqo-local-contracts` ejecuta secuencialmente la higiene del candidato, la política fail-closed de staging, el preflight B5 y 32 contratos puros/no mutantes. La lista es deliberadamente explícita: incluye la integración Auth.js con cookie segura detrás de proxy, la política de orígenes de imágenes y la lectura aislada de jornadas móviles, pero no incluye pruebas PostgreSQL, navegador, Android, HTTP desplegado ni proveedores. El proceso se detiene ante el primer fallo y conserva su código de salida.

Los siguientes comandos comparten `ISOLATION_TEST_DATABASE_URL` e `ISOLATION_TEST_EXPECTED_DATABASE` y aplican el guard antes de importar Prisma o servicios:

- `test:messaging-isolation`
- `test:meeting-isolation`
- `test:forum-isolation`
- `test:team-isolation`
- `test:private-storage-isolation`

`test:worklog-isolation` conserva variables separadas porque necesita un baseline ICC específico.

## Estado

El contrato funcional queda pendiente de una copia local desechable que contenga el baseline ICC necesario. No debe ejecutarse contra producción ni contra una base compartida. El resto de los contratos B1–B5 ejecutados en esta fase quedó aprobado.

## Higiene del gate estático

ESLint excluye `.playwright-cli/`, `output/` y `tmp/` porque contienen resultados y bundles efímeros de QA, no fuentes mantenidas del producto. Las excepciones restantes se limitaron a HTML transaccional de correo y medios privados servidos por APIs autenticadas: esos recursos deben usar etiquetas HTML directas y no atravesar el optimizador público de imágenes de Next.js.

Validación de cierre: `npm run lint`, `npm run typecheck`, `npm run build` y `git diff --check` aprobaron sin errores. El build no mostró advertencias de lint. No se aplicaron migraciones ni se contactaron servicios de producción.
