# Preparacion del lanzamiento: evidencia remota y estado productivo

Fecha: 30 de octubre de 2026. Este corte sustituye las listas de pendientes
anteriores; conserva su evidencia historica. Daybreak queda fuera del alcance.
Aplicacion candidata: `d28b881cdfcf7576069579a3e00087eb53157a13`.
Rama de trabajo: `codex/platform-staging-release`.

**Estado: lanzamiento pendiente, no 100 %.** B1-B5 tienen gates remotos
aprobados, respaldo actualizado con recuperacion local y ensayo integral UTF8.
La base productiva necesita la ejecucion controlada del ledger/migraciones y
la decision de activacion. No se publico codigo nuevo
en produccion ni se modificaron filas reales. Si se corrigieron seis valores de
configuracion de destinos productivos, descritos abajo.

## Validaciones cerradas

| Bloque | Candidato / deploy de staging | Evidencia |
| --- | --- | --- |
| B1/B2 y B3 | `3c230a1` / `6ae4e73dbd4d5db6f8e437e0` | PASS final del plugin; 107170 ms y 245415 ms; limpieza SQL independiente |
| B4 y B5 readiness | `6003f25` / `6ae4e9d281e692cdc6f06325` | PASS final; 223059 ms y 58845 ms; cero fixtures |
| B5 dispatcher/proveedor | `d28b881` / `6ae4f00dc51f7b635c94811d` | PASS final; 38072 ms; HTTPS 202, worker terminal READY/INSUFFICIENT, un intento, proveedor/modelo/completado verificados y lectura autorizada |
| CI del candidato | GitHub Actions `41115621082` | SUCCESS: instalacion, audit de severidad moderada, higiene, lint, tipos, contratos y build |
| Contratos locales | `d28b881` | 46 aprobados |
| Acceso publico | Gate local documentado en `account-access-gate-2026-10-30.md` | 34 estados Chromium, teclado, movimiento reducido, 320 px, texto 200 %, axe sin infracciones en el alcance |

Los deltas posteriores a B4 no modifican sus flujos: agregan guardas de entorno,
el fixture real de cola B5 y la correccion de su transaccion. No se extrapola la
prueba local de interfaz a un dispositivo o lector de pantalla fisicos.

El primer intento B5 usaba un hash de fixture distinto al calculado por la cola
real y el worker lo rechazo. Se sustituyo por `queueEvidenceAnalysisJob`.
El segundo reprodujo P2028: las lecturas de autorizacion salian de la transaccion
y pedian otra conexion. Ahora usan el mismo cliente transaccional y snapshot,
con timeout de 15 s y espera maxima de 5 s. El tercer intento aprobo sin relajar
las comprobaciones de campos autorizados, revocacion, identidad ni resultado.

Consultas SQL independientes posteriores a B4/B5 confirmaron cero usuarios,
workspaces, necesidades, dossiers, colaboraciones, certificados y jobs de prueba.
La credencial Groq temporal se retiro del sitio de staging con readback de ausencia.
Se restablecieron proveedor `off`, cohorte vacia, B4/B5 desactivados y fase B1-B3.
El despliegue de cierre `6ae4f17330916b391143f258` sobre `d28b881` aprobo B1/B2
en 105788 ms y B3 en 194331 ms, con PASS final del plugin. Readback SQL posterior:
cero usuarios, workspaces, jobs, selecciones y grants.

## Revisiones de seguridad selladas

Complementan las revisiones y remediaciones anteriores; no son auditorias nuevas
de toda la plataforma ni autorizan el despliegue por si solas.

- `056402cb-38bf-4652-b482-cdfd9c5c930f`: `7d22378..6003f25`, 32 archivos fuente
  revisados mas lockfile y artefactos del alcance; cero hallazgos nuevos.
- `e4e44c64-38c9-421c-a8ae-3483a0ce3eb3`: `6003f25..1a13baf`, cinco archivos;
  cero hallazgos nuevos.
- `5452537d-84a7-47ce-bec5-efb9c08281d0`: `1a13baf..d28b881`, cuatro archivos;
  cero hallazgos nuevos. Comprobado el sello y sus documentos canonicos.

El advisory bajo GHSA-6hxq-p678-4hr2 de la cadena SimpleWebAuthn/Auth.js sigue
documentado en `platform-dependency-gate-2026-10-30.md`; no se considera corregido.
No se impuso un override incompatible de version mayor.

## Configuracion productiva corregida

Readback del sitio `2d38524a-44f9-4473-8a1f-9270e03bc2bf`: seguia publicado
`e6ff153694dc01ab8a2b5848556fa6839626b2af`, deploy
`6ad15f6bb093f03c93fc021e`. La rama productiva sigue siendo
`codex/icc-production-preview`. `.netlify/state.json` apunta a ese sitio:
no ejecutar `netlify deploy` sin destino explicito.

El contexto production contenia destinos de staging. Se corrigieron exclusivamente:

| Variable | Valor confirmado |
| --- | --- |
| NEXT_PUBLIC_SITE_URL | https://terraqoglobal.com |
| NEXT_PUBLIC_PORTAL_URL | https://portal.terraqoglobal.com |
| NEXT_PUBLIC_ADMIN_URL | https://admin.terraqoglobal.com |
| NEXT_PUBLIC_API_URL | https://api.terraqoglobal.com |
| AUTH_URL | Vacio; Auth.js utiliza el host de la solicitud con AUTH_TRUST_HOST=true |
| PLATFORM_STAGING_CONFIRM | Vacio |

Otros contextos, secretos y DATABASE_URL se preservaron. Readback posterior
y guard ejecutado contra las variables productivas reales aprobados. El guard de build rechaza destinos mezclados, host de auth fijado,
rama incorrecta y variables exclusivas de staging en produccion. Esta correccion
no reconstruye ni publica el sitio. Rollback de valores no secretos disponible
localmente en `output/production-origin-repair.json`.

## Base productiva: lectura y ensayo aislado

Consulta mediante TLS verificado, transaccion READ ONLY y rollback; no se leyeron
contenidos de clientes. Produccion sigue en `db.prisma.io`, esquema `icc`:

- 28 migraciones exitosas en el ledger; cero incompletas. Existe una entrada
  historica rolled_back seguida de su aplicacion exitosa, conservada intacta.
- Checksums de las 28 migraciones: coinciden con los archivos inmutables.
- 15 nombres pendientes en el ledger: ocho bootstraps historicos y siete B1-B5.
- Faltan 31 tablas del candidato y tres columnas de TerraqoWorklogEntry:
  lifecycle, version y currentRevisionId.

Se exporto solo el esquema, sin filas ni ledger ni propietarios/ACL. SHA-256:
`2a8de844151a35b9a494df629000afa907e15afbb7210a3bb6f9de5ae62dfd0d`.
El archivo permanece ignorado por Git en `output/production-schema-only.sql`.

1. Primer ensayo local: aplicar las 15 pendientes falla en
   `20261008161000_native_worklog_decision`, codigo PostgreSQL 42P07:
   `NativeWorklogOperation_decision_binding_key` ya existe. No ejecutar
   `migrate deploy` general sobre produccion sin reconciliar el ledger.
2. Segundo ensayo: reconstruccion transaccional de los ocho bootstraps en una
   copia vacia, comparando todo el catalogo antes/despues, luego rollback.
   Equivalencia exacta: 121 tablas, 1521 columnas, 1400 constraints en PG18,
   515 indices, cero triggers de usuario y cero politicas. Solo entonces se
   resolvieron las 36 entradas historicas en la copia local y se aplicaron
   las siete nuevas. Ledger local 43:43:0 e indice full-text valido/listo.
   El gate de drift final rechazo diferencias historicas adicionales.
3. Tercer ensayo: el diff de la copia frente al modelo productivo `e6ff153`
   confirmo 15 sentencias de drift anteriores a B1-B5. El caso de backfill
   sintetico se detuvo antes de aplicar las siete nuevas porque initdb uso
   WIN1252 y rechazo Unicode. Se detuvo el ciclo completo tras tres intentos.

Las 15 sentencias historicas corresponden a diez nombres de indice truncados,
un indice adicional de BuilderContribution y dos FKs de reclamaciones que el
modelo declara RESTRICT (cuatro sentencias DROP/ADD). No se ejecuto ese diff.
Debe revisarse su disposicion; no se acepta ni corrige silenciosamente.

Se corrigio el runner local para crear PostgreSQL con UTF8. Prueba especifica
real: tabla temporal, INSERT parametrizado y SELECT de `ñ 漢字 😀`, PASS;
cluster detenido y eliminado. Typecheck y lint focalizado aprobados.
La prueba especifica por si sola no cerraba el ensayo completo. Tras la fase
independiente de respaldo se ejecuto la ultima correccion integral (UTF8):
**PASS**. Ocho bootstraps equivalentes, 36 resoluciones solo locales, siete
migraciones aplicadas, ledger 43:43:0 y full-text valido/listo. Cinco bitacoras
sinteticas PUBLIC/PRIVATE/WORKSPACE, eliminada y rechazada conservaron todos
sus campos anteriores, incluidos fechas, moderacion, alcance y puntos. Cada
una tiene su revision 1 coherente y searchVector generado; fixtures eliminados,
cero filas de aplicacion finales y cluster temporal retirado.

La comparacion contra el modelo `e6ff153` anterior prueba que las 15 sentencias
de drift ya existian. Despues de las siete migraciones solo se agregan las dos
diferencias full-text intencionales. No se altero ni debilito el gate estricto
de staging: este es un ensayo separado de preservacion del origen productivo.
La disposicion del drift historico sigue siendo una decision de lanzamiento.

Artefactos locales sin secretos ni datos reales:
`output/production-schema-readback.json`, `output/production-bootstrap-equivalence.json`,
`output/production-schema-rehearsal/run.log`, `run-v2.log`, `run-v3.log`,
`run-final.log`, `baseline-drift.json`, `drift-preservation.json` y `backfill-proof.json`.

## Bloques pendientes de salida

1. Ensayo integral UTF8 y backfill sintetico **cerrados**. Revisar la disposicion
   del drift historico; no alterar migraciones ya aplicadas ni aplicar el SQL
   de diff. Las pruebas se mantuvieron fuera de produccion.
2. Respaldo productivo actualizado y recuperacion local **cerrados** en la fase
   independiente descrita abajo. Quedan la recuperacion fuera de este usuario
   Windows y el inventario de blobs; no se copiaron datos reales a staging.
3. Definir ventana de mantenimiento y secuencia exacta: comprobar baseline
   fresco, reconciliar solo los ocho bootstraps demostrados, aplicar siete
   migraciones, verificar ledger/catalogo/backfill, reconstruir con variables
   productivas y promover un candidato revisado. Apagar flags como primer
   rollback; no eliminar tablas ni restaurar datos sobre escrituras nuevas.
4. Cerrar la recuperacion operativa de PUT ambiguo. Actualmente se conserva
   reserva/cuota; TTL o DELETE no acreditan que un PUT tardio sea imposible.
   No liberar esa cuota mediante una correccion insegura.
5. QA con dispositivo/lector de pantalla reales y decision sobre cohorte,
   limites comerciales y riesgos residuales. No hay evidencia nueva de esos
   cierres; no se atribuyen firmas del usuario ni de otros responsables.

Los porcentajes 68 %/97 % de documentos previos son cortes historicos, no una
medicion actual. No se recalculan inventando puntos a partir de pruebas aisladas.
Este documento deja el siguiente bloque concreto; no declara un lanzamiento.

## Respaldo privado actualizado

Snapshot consistente de solo lectura del 30 de octubre, `20261030T194418Z`.
Se verifico en memoria que los componentes de la conexion directa coinciden
con el destino del sitio productivo. Inventario fresco, cero indices invalidos;
TLS verify-full. No se altero ninguna fila ni objeto de la base origen.

Exportacion de 122 tablas (incluido ledger), 1901 filas, 422 constraints de
PG17 y 516 indices. Archivo cifrado con AES-256-GCM, clave protegida con DPAPI
y directorio ACL privado. Recuperacion en PG18 local aislado: todos los hashes
por tabla y definiciones de esquema coinciden; cifrado/descifrado verificados.

- SHA-256 del archive antes de cifrar:
  `dc9af9977e16aceed281b0ebc15470eb12ebd37067f9b0be6db2d5f236454a81`.
- Ubicacion privada: `C:/Users/Binv/.terraqo-private/migration-20261030T194418Z`.
- El archivo plaintext y cluster temporal fueron retirados tras detenerlo.
- El inventario local anterior se restauro exactamente; lock temporal retirado.
- No se abrieron los respaldos historicos ni se expusieron filas/credenciales.

Limites: esquema icc; blobs externos y schemas de sistema no incluidos. La
clave DPAPI depende del usuario Windows. La restauracion prueba recuperacion
del respaldo en ese entorno, no la compatibilidad del cambio de aplicacion ni
el tiempo de una recuperacion productiva. El ensayo de migraciones usa solo
el esquema y datos sinteticos, nunca esta copia privada.

`production-migration-manifest-2026-10-30.json` fija los 15 archivos y sus hashes
para revision: ocho reconciliaciones historicas y siete aplicaciones futuras.
No es un script de aplicacion ni acredita que hayan sido ejecutadas en produccion.

## Propuesta concreta de primera publicacion

La peticion de lanzamiento permite preparar y validar esta entrega. La
instruccion anterior reserva las migraciones y modificaciones de datos reales
a autorizacion explicita. La operacion pendiente queda delimitada asi:

1. Confirmar ventana de mantenimiento; repetir lectura del ledger, destino,
   hashes y equivalencia del catalogo. Rechazar cualquier cambio inesperado.
2. Conservar el respaldo nuevo y la identificacion del deploy anterior.
   Registrar en Prisma solo los ocho bootstraps ya existentes y comprobados;
   aplicar exactamente las siete migraciones del manifiesto. No ejecutar
   `db push`, el SQL de drift, ni migraciones fuera de esa lista.
3. Verificar las 43 migraciones exitosas, ninguna incompleta, revision inicial
   por bitacora preexistente, privacidad y contadores conservados e indices
   listos. Preservar la entrada historica rolled_back; no falsificar el ledger.
4. Construir y publicar el candidato revisado en el sitio productivo explicito,
   con las URLs ya corregidas. Activar B1-B3 para la primera salida; mantener
   B4/B5, el proveedor de analisis y la cohorte cerrados hasta su decision
   comercial y operativa. No ejecutar cobros ni cambiar clientes/planes.
5. Comprobar HTTPS de sitio, portal, admin y API, acceso/registro, feed publico,
   revocacion y ausencia de errores nuevos. Ante fallo, apagar flags o volver
   al deploy anterior; conservar el esquema expandido y las escrituras nuevas.

Esta propuesta no declara cerrados QA fisico/lector real, recuperacion fuera
del equipo, inventario de blobs ni la reconciliacion de PUT incierto. Esos
limites deben figurar en la decision de salida. No se sustituye su evidencia
por una firma o aprobacion inferida.
