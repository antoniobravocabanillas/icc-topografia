# Remaining platform execution — 3 November 2026

## 20 de noviembre — S18: migración ensayada; aceptación integrada pendiente

CV integrado al reemplazo/retiro con historial y concurrencia; DOCX acotado y PDF conservado. Pruebas de formatos, PostgreSQL/archivos reales y componentes Chromium PASS. Migración51 preparada: ensayo del SQL completo sobre copia de staging PASS,160 tablas previas conservadas, ledger50→51, reversión ante fallos, permisos restaurados y segunda aplicación rechazada. Staging remoto verificado aún en50; sin despliegue ni migración remota. Next15.5.29 y WebAuthn13.3.2 validados, build completo PASS; adaptador Netlify5.16.8 fijado. Próximo bloque: aceptación conjunta con inicio de sesión real, luego promoción a staging y recorridos alojados. El cliente nativo todavía necesita controles de reemplazo versionado; sus lecturas ya ocultan retirados y reconocen historial. La compensación de alta fallida se probó; una purga general de cuentas no se ha implementado ni se presume necesaria para este alcance. Detalle y restricciones: proposals/s18-document-lifecycle.md.

## 20 de noviembre — S18: limpieza programada autenticada preparada

Cron acotado → worker background → API interna conectados al despachador existente, apagados por defecto con TERRAQO_DOCUMENT_LIFECYCLE_V1. Autenticación constante, secretos/destinos aislados, deadlines, contadores sin contenido privado. Pruebas de wrappers empaquetados, API, aislamiento de todos los jobs y regresión PostgreSQL PASS; TypeScript/ESLint PASS. No schedule remoto activado ni migración/despliegue. Continúan Office/CV, retención/purga y aceptación en staging antes de producción.

## 20 de noviembre — S18: rutas autenticadas y acciones documentales en línea

Retiro/reemplazo conectados a adaptadores HTTP, apagados por defecto mediante TERRAQO_DOCUMENT_LIFECYCLE_V1. Pruebas de sesión/origen/cuerpo real/campos duplicados PASS. Interfaz de documentos complementarios incorpora confirmación sin modal, reintento idempotente, conflicto y retiro inmediato; revisión local desktop/móvil detectó y corrigió desbordamiento. TypeScript/ESLint/detector PASS. No activar ni desplegar aún: faltan Office/CV, retención, programación de limpieza, migración y aceptación alojada. Detalles y límites de la evidencia en proposals/s18-document-lifecycle.md.

## 20 de noviembre — S18: retiro efectivo en descargas e importación

Descargas web/nativas e importación de CV bloquean documentos retirados, incluida publicación tardía del extractor. Eliminación antigua protege linaje e intentos conservados. PostgreSQL real, rutas/servicios con dobles controlados, regresión nativa, TypeScript y ESLint PASS. Sin cambios remotos. Próximo: Office/retención, API/UI y programación de limpieza, preparación de migración y aceptación autenticada en staging. No desplegar este candidato contra el esquema anterior. Detalle: `proposals/s18-document-lifecycle.md`.

## 20 de noviembre — S18: esquema Prisma y cuota compartida alineados localmente

Esquema Prisma modela ciclo documental/intentos; diff estructural completo contra PostgreSQL pre-S18 + SQL propuesto vacío. Piso de cuota compartido incluye reservas de reemplazo sin doble cómputo, con regresiones de limpieza/documentos/evidencias y suite PostgreSQL PASS. TypeScript/ESLint/Prisma validate/generate PASS. **Candidato incompatible con DB sin esta migración: no desplegar aún.** SQL sigue fuera de migraciones activas y no se aplicó remotamente. Próximo: barreras en descargas/importación/aplicación, compatibilidad Office/borrado de cuenta, API/UI y promoción aprobada de staging. Detalle: `proposals/s18-document-lifecycle.md`.

## 20 de noviembre — S18: carga integrada y despachador de limpieza internos

Orquestador conecta validación/hash, reserva, escritura y confirmación; despachador acotado recupera intentos pendientes/abandonados y revisita tombstones. PostgreSQL + archivos locales reales PASS, incluidos recibo sin recobro, respuesta SQL perdida, timeout y escritura tardía sin confirmación posterior. TypeScript/ESLint PASS. Sin endpoint/scheduler activado ni despliegue. Próximo: esquema y pisos globales de cuota, barreras de lectura/importación, compatibilidad de Office/borrado de cuenta y API/UI antes de staging. Detalle actualizado en `proposals/s18-document-lifecycle.md`.

## 20 de noviembre — S18: recuperación de archivos y devolución única de capacidad

Recuperación implementada con marca de limpieza confirmada antes de borrar, protección de archivo vigente, timeout/backoff y devolución de capacidad una sola vez. Tombstones sin cargo conservan vigilancia para escrituras tardías. PostgreSQL y archivos locales reales PASS, incluidas carreras, rollback después de borrar y cuota inconsistente. TypeScript/ESLint PASS. Falta conectar escritura/despachador y pisos globales de cuota, además de lectores/UI/staging; no hay limpieza automática ejecutándose ni cambios remotos. Ver `proposals/s18-document-lifecycle.md`.

## 20 de noviembre — S18: reserva y confirmación duraderas de cargas

Servicios transaccionales de reserva/confirmación y marca de limpieza implementados; ledger personal propuesto fuera de migraciones. PostgreSQL real PASS: cobro de capacidad e intento atómicos, rollback, reintentos sin recobro, cargas simultáneas con claves separadas y un solo sucesor, conservación del archivo confirmado y bloqueo de confirmación tras marcar limpieza. No se elimina almacenamiento ni se reembolsa cuota todavía. Próximo obligatorio: conectar escritura/recuperación y actualizar todos los pisos de cuota compartidos antes de desplegar. Sin rutas activas, migraciones remotas ni despliegue. Detalle en `proposals/s18-document-lifecycle.md`.

## 20 de noviembre — S18: reemplazo documental transaccional validado

Núcleo de reemplazo con versión esperada, huella de contenido e idempotencia implementado; conserva revisión anterior y crea sucesor pendiente. PostgreSQL local real PASS: carreras/reintentos, contenido cambiado, propietario ajeno, membresía empresarial vigente/revocada, rollback, retiro concurrente y puntero CV condicional. TypeScript/ESLint PASS. SQL propuesto ampliado fuera de migraciones; sin rutas activas, cambios remotos ni despliegue. Próximo: integrar reserva/compensación de cargas y barreras de lectura/importación antes de API/UI y staging. Detalle: `proposals/s18-document-lifecycle.md`.

## 20 de noviembre — S18: retiro transaccional y linaje ensayados en PostgreSQL local

SQL propuesto fuera de migraciones activas y núcleo transaccional de retiro implementados. PostgreSQL desechable real PASS: compatibilidad de filas antiguas, sucesor único, aislamiento de propietario, carreras de reemplazo/retiro, reintento exacto, conflicto de versión, rollback y limpieza condicional de cvUrl. Se conserva revisión y almacenamiento; clúster y carpeta temporal eliminados tras comprobación. No hay endpoint conectado, migración remota ni despliegue. Próximo: comando de reemplazo, barreras de descarga/importación, compatibilidad de borrado de cuenta y UI antes del gate S18 alojado. Detalle: `proposals/s18-document-lifecycle.md`.

## 20 de noviembre — S18: protección de carga y contrato documental

Web y Android ahora limitan los bytes reales antes de interpretar multipart; se conserva el límite individual y se rechaza tamaño total excedido, formato inválido o timeout. Pruebas sintéticas de stream y regresiones de identidad/CV/eliminación/limpieza PASS. Auditoría ampliada encontró eliminación nativa ya existente y protegida; falta retiro/versionado en web, no hay que duplicar ni debilitar esa eliminación. Contrato en `proposals/s18-document-lifecycle.md`, sin campos ni migración aplicada. Siguiente: implementar ciclo de vida y matriz transaccional aislada; aceptación S18 staging sigue pendiente. Sin despliegue ni datos remotos modificados.

## 20 de noviembre — S18: pantalla consolidada de accesos implementada localmente

Nueva ruta `/portal/accesos`, búsqueda por selección/destinatario, permisos y vencimientos, revocación inline y recuperación explícita de conflictos. Navegación integrada con Documentos y Mi plan. Prueba Chromium de búsqueda, vacío, cancelación, conflicto y continuidad de versión PASS; contrato de consulta del propietario con DB simulada PASS. Capturas escritorio/móvil inspeccionadas. No es aceptación autenticada alojada ni cierre de S18.

Auditoría encontró pendientes concretos: Documentos no tiene retiro ni linaje explícito de versiones; Plan empresarial autoriza al propietario actual, no a cualquier administrador. Siguiente bloque: ciclo de vida documental conservando revisión/importaciones/cuotas y permisos, después gate S18 en staging. No se aplicaron migraciones ni despliegues. Detalle y límites: `s18-access-documents-plan.md`.

## 20 de noviembre — S18: listado de accesos, corrección local validada

Referencia S18 del PDF revisada visualmente (página física19) y contrastada con sus reglas. Corregido listado existente: permiso explícito, estados legibles, vencimiento con hora de Perú y retirada de acciones al caducar sin recargar. Chromium1440/375/320 y regresión de confirmación/cancelación/revocación PASS; TypeScript/ESLint PASS, capturas inspeccionadas. Sin despliegue ni cambios de DB. No equivale a pantalla S18 completa ni gate alojado. Siguiente: consolidar navegación de accesos, auditar Documentos privados y Plan/autorización empresarial, luego aceptación autenticada staging. Detalle: `s18-access-documents-plan.md`.

## 20 de noviembre — Migración50 aplicada y candidato de consentimiento servido en staging

Autorización específica recibida y ejecutada: proyecto `mghdpciewbsowjrjwmwk`, ledger50 sin migraciones incompletas; backup fresco restaurado y 158 tablas conservadas. Runtime servido `a187f7c9ebb8ddc7af3a3af71109dcd98bbd3b65`, árbol idéntico al candidato autorizado `70efdb3`, deploy `6b0071c2c0bc5284f750dc3e`. Solo staging; producción intacta. Este checkpoint sustituye las indicaciones históricas de migración50 no aplicada.

El build de Netlify terminó sin recibo terminal del plugin de pruebas; ese recibo NO se marca PASS. La matriz separada de consentimiento contra el mismo runtime terminó exit0: doble autorización UI, campos exactos, destinatario verificado, vencimiento real, revocación, membresía vigente, idempotencia/concurrencia, CSRF/límite de cuerpo e inmutabilidad SQL. Capturas autenticadas móvil/escritorio inspeccionadas. Limpieza independiente del run `be3a5877-e7fa-4208-b44f-6685893d7726` PASS: cero fixtures, cuatro blobs ausentes, piloto exacto retirado, invitación previa conservada. Gate sintético apagado; candidato servido confirmado. TypeScript/ESLint/diff-check PASS. Ver `proposals/s17-disclosure-release-gate.md` para evidencias y límites.

Siguiente bloque: revisar criterios S18 del PDF y el inventario restante de lanzamiento. El reporte automático del gate combinado sigue como pendiente de herramientas de release; no confundir la matriz alojada separada con un recibo inexistente del plugin. Producción sigue sin cambios.

## 20 de noviembre — Compartir constancia S17: controles locales PASS; staging pendiente

Este checkpoint sustituye el pendiente de implementacion de compartir constancias de las entradas historicas. Persistencia separada, seleccion exacta, autorizacion explicita de empresa y profesional, acceso publico/invitado, vencimiento y revocacion estan implementados localmente. Migracion50 propuesta `20261120000200_certificate_disclosure_consent`, NO aplicada remotamente. No confundir autorizacion anterior de migracion49 con esta nueva.

Recorrido real completo PASS `a55a25fd-72f0-4482-8944-6c347cae5848`, limpieza independiente verificada, TypeScript/ESLint focalizado/snapshot PASS. Corregida etiqueta accesible del selector de destino tras aislar timeout del navegador. Capturas reales escritorio/movil revisadas; sin overflow a 1440/375/320. No es aprobacion global del PDF ni cierre de fase alojada. Detalle y orden de promocion: `proposals/s17-disclosure-release-gate.md`.

Siguiente: fijar candidato, autorizacion especifica migracion50 + staging, backup fresco/restauracion/artefacto con ACL y ledger49, aplicacion y despliegue exclusivamente staging, recorrido alojado y limpieza. Staging no fue modificado en esta continuacion; ultimo estado registrado en checklist: runtime `ab8b64f`, ledger49 (no reconsultado en este turno). No publicar el commit diagnostico `4004fb8`. Produccion intacta; S17 abierto, S18 no promovido.

## 20 de noviembre — S17 procedencia: implementacion y recorrido local completos

Este checkpoint sustituye los bloqueos historicos de procedencia descritos debajo. En `codex/s17-closure-provenance`: vinculo inmutable revision-propuesta, comprobacion de ambas aceptaciones, DTO historico y editor que conserva texto/alcance ante conflicto hasta revision explicita. Compatibilidad legacy NULL sin backfill; constancias privadas por defecto.

Validaciones: 105 invariantes PostgreSQL, 34 comprobaciones de carreras en sesiones independientes, 28 casos de servicios con guards y cuatro comprobaciones de arranque; regresion S16 completa. Recorrido autenticado Next/PostgreSQL/Chromium PASS primer intento, run `91dbab1c-0dfc-4016-a529-41450280159e`: propuesta, borrador, evidencia protegida, correccion/reenvio, constancia privada, cancelacion/replay, aislamiento y limpieza independiente. TypeScript y ESLint focalizado pasan. Capturas 1440/375/320; inspeccion visual movil realizada, sin declarar aprobacion visual global.

Migracion preparada `20261120000100_closure_accepted_proposal_provenance`, aditiva y sin backfill. **No aplicada remotamente.** Antes de desplegar cliente Prisma nuevo debe existir la columna; no basta desactivar un flag. Hace falta autorizacion especifica para esta nueva migracion en staging, luego gate alojado con fixtures sinteticas y limpieza. Produccion permanece intacta.

Staging vigente validado anteriormente: candidato `c5598dcf2fcd16617ac4e808463688f5db0cc8ac`, deploy `6affea85f1fdf213a24050b3` (controles S16/S17 PASS). No confundir con el nuevo candidato local. Pendiente independiente: compartir constancia como recurso propio con consentimiento profesional y empresarial exacto, revocacion y permisos de archivos separados. **S17 no cerrado; S18 no promovido.** Detalle en `proposals/s17-writer-integration-gate.md` y `proposals/s17-accepted-proposal-provenance-notes.md`.

## 20 de noviembre — Segundo candidato S16: transaccion cerrada al enviar

Candidato `f0b34c58c54bd92a9af09d66dc9e199cf43354af`, deploy `6affe6853aae467a0f0a9225`: marcador exacto verificado y build correcto; gate `failed_plugin`. Paso propuesta, aceptacion, layouts y guardado privado con referencia exacta. El envio del cierre devolvio 500 (esperado 200). El log de funcion del mismo deploy registra `PrismaClientKnownRequestError` y `Transaction API error: Transaction not found` en `terraqoClosureRevision.update`, requestId `42e885d8-3a86-4e9c-b733-c3f3d2788de4`. No es un fallo de selector ni se debe relajar el codigo esperado. Guardar/enviar conservaban el timeout predeterminado; aceptar ya usaba 20 segundos. Se unifica el presupuesto explicito Serializable/maxWait 10s/timeout 20s, sin sacar las autorizaciones de la transaccion ni reintentar automaticamente timeouts ambiguos. La hipotesis de expiracion por latencia debe confirmarse con regresion y siguiente ensayo, no darse por resuelta solo por cambiar el limite.

Ejecucion `21bf94b2-221e-4a00-a352-764fd13c4132`: limpieza independiente del runner y SQL de comprobacion dieron cero workspace/usuarios/colaboraciones/auditoria propios. Cuatro blobs `1363b27e-c352-4a60-8c69-0a1c2ec82a07` eliminados con lectura fuerte de ausencia; piloto de este candidato retirado. Produccion intacta. Evidencia ignorada: `output/s16-hosted-result-2.json`, `output/s16-full-build-log-2.json`, `output/s16-function-log-2.json`.

Regresion real PostgreSQL 18.4: suite completa `test-s16-closure-visibility-local.ts --confirm=local-s16-only` PASS (`output/s16-budget-local.log`). Bloqueo confirmado del padre por mas de 5500ms tanto al guardar como enviar, sin estado parcial durante la espera; replay exacto conserva revisiones/versiones, accesos ajenos y payload/alcance conflictivos rechazados. Visibilidad, revocacion de referencias, rollback y carrera CV/ACCEPT pasan; limpieza independiente y cluster eliminado. Se actualizaron membresias explicitas de fixtures antiguas en ambas empresas para conservar el test de aislamiento de recurso. TypeScript, lint y contratos pasan. Preparado tercer y ultimo intento alojado de este checkpoint; aun no afirmar PASS en staging.

Propuesta S17 separada en worktree `icc-topografia-s17-provenance`, branch `codex/s17-closure-provenance`, commit `612a422`: relacion nullable a propuesta aceptada y SQL propuesto, NO APLICADO y fuera de migrations. Prisma validate y revision estatica pasan; no se ensayaron SQL ni concurrencia. Sus requisitos Serializable y limpieza ordenada deben ensayarse antes de promover. No forma parte del candidato de staging. Compartir constancia sigue pendiente.

## 20 de noviembre — Primer candidato S16 alojado: fallo de espera, limpieza verificada

Candidato `77764399e58567473d770fbf6510a88f33c75269`, deploy `6affe3f30f7d106d4366e704`: build y marcador servido correctos. Plugin `failed_plugin` al esperar `aria-busy=false` en el panel de propuestas, antes de crear la propuesta. No se conoce el valor recibido: el resumen original no conservaba ese detalle. No atribuirlo definitivamente a latencia. Se cambia la seleccion del panel a un testid unico y las aserciones de UI a un limite explicito de 45 segundos; no se relajan los estados ni los codigos esperados. El proximo ensayo debe confirmar si resuelve el fallo.

Ejecucion `bd4983f7-a3b1-47e1-9d9d-d1fc04f32ede`: log completo recuperado por WebSocket confirma `cleanup:verified`. SQL independiente comprobo cero workspace/conversaciones/colaboraciones/auditoria del candidato y cero usuarios/workspace alterno propios. Los cuatro blobs `7968d872-74d0-4f15-8ea2-39914a940fb6` se eliminaron con lectura fuerte de ausencia; piloto retirado. Produccion intacta.

Revision visual real de escritorio encontro un titulo cortado por el ancho util del portal. Corregidos tipografia y layout segun contenedor, no solo viewport. Chromium con Satoshi y espacio de sidebar valida palabras completas, sin overflow a 1440/1200/1024/390/320. TypeScript y ESLint pasaron. El siguiente candidato combina esa correccion visual y diagnostico/esperas de staging; no cambia autorizaciones.




## 20 de noviembre — Controles integrados S16/S17 locales PASS



Ejecución `6dbdd14c-d153-4342-ae67-d7aa11aa3dee`, `output/s16-controls-after-page-prerequisite-2.log`: recorrido real con PostgreSQL/Next/Chromium pasó propuesta/aceptación, selección exacta vía UI, borrador privado, referencia e imagen autenticada, corrección/reenvío/constancia privada, cancelación con actor histórico/replay y aislamiento anónimo/otra empresa. Limpieza independiente verificada y clúster eliminado. Las capturas de 1440/375/320 no presentan overflow; galería móvil inspeccionada. El recibo conserva `phaseComplete:false`: no equivale al cierre global S16/S17 ni a verificación alojada. El SHA del recibo local identifica el HEAD de base y no el árbol sin commit; el candidato de staging se fijará tras este checkpoint.



TypeScript, ESLint focalizado, contratos, adaptadores 401/403, detector de UI y diff-check pasaron. Wiring S16 de staging preparado sin migración. Próximo paso operativo: commit del candidato, medios sintéticos acotados, deploy exclusivo de staging, gate alojado y eliminación/lectura independiente de sus medios. Mantener los pendientes de constancia compartible y snapshot de alcance descritos debajo.





## 20 de noviembre — Prerrequisito de render S16 resuelto; nuevo checkpoint



`verify-s16-closure-page.ts`, mediante `s15-local-rehearsal.ts --confirm=local-s15-only --s16-page-only`, pasó con PostgreSQL desechable y sesiones reales. Ejecución `f43ccfd0-e562-4f53-97e3-6e66e0fbb1b0`: GET empresa sin cierre y con borrador 200; GET profesional enviado 200; imagen protegida decodificada; anónimo POST 401; 1440/390/320 sin overflow; cero pageerrors; limpieza independiente y clúster descartado. El mensaje terminal heredado decía S15: corregido para que los próximos recibos identifiquen este prerrequisito; no convertir ese texto heredado en un recorrido S15 nuevo.



Se reabrió la integración solo después de resolver este prerrequisito. Primer ensayo del checkpoint `ddc26600-6890-45ba-bd7d-369e38ecf48d` pasó todo hasta aislamiento final y limpió independientemente. El test esperaba 404 en save de otra empresa, pero recibió 403 `FEATURE_NOT_ENTITLED`: el workspace alterno no pertenece al piloto, por lo que se rechaza antes del lookup. Ajustado el contrato de tres mutaciones empresariales (save/submit/cancel) para exigir exactamente 403 y ese código, sin ampliar el piloto. Decisiones de destinatario, lecturas y medios conservan 404 para otro tenant. No presentar el 403 como una autorización de recurso ni como prueba suficiente del filtro de tenant, que se cubre también en las suites PostgreSQL.



Runner y plugin de staging incorporan un modo S16 independiente, origen/identidad/candidato exactos y piloto exclusivo. El resultado alojado se denomina **controles S16/S17**, no fase completa. `s24-staging-blobs` sigue siendo el operador de preparación/limpieza de medios sintéticos. No se ha lanzado todavía este candidato.



Pendientes explícitos S17: S06 solo modela selecciones de revisiones de bitácora; aún falta un flujo autorizado de compartir la constancia como recurso independiente. La frase informativa privada no sustituye ese flujo. Mantener además el pendiente de snapshot persistido de alcance aceptado y la validación alojada antes de avanzar de fase.





## 20 de noviembre — S16/S17: selector y medios protegidos; integración aún abierta



Estado actual: **no desplegar ni cerrar S16/S17**. Staging conserva el candidato S15 `78634938d6180a7c7c6b576f42fa0b602d9d6042`. Los cambios siguientes están en el árbol local. No se aplicaron migraciones ni se tocó producción.



- Selector de fuente exacta `PUBLIC_CV` / `PUBLIC_SELECTION`: conserva raíz, revisión, hash y techo de campos/medios autorizado. Seis grupos PostgreSQL del selector pasaron. El resultado del cierre admite vacío; no publica ni mueve archivos.

- Vista previa inline, sin modal, con galería autenticada. La entrega vuelve a autorizar antes y después de cargar/normalizar el WebP; nombre genérico, no-store y sin ETag. El agente completó pruebas PostgreSQL de doce cambios durante carga pausada, rollback submit/ACCEPT, permisos empresariales retirados y conservación del historial. El techo vacío de snapshots antiguos no se amplía. Máximo seis imágenes; la comprobación de 8 MiB reales ocurre después de la lectura del blob. No afirmar inmutabilidad histórica de bytes.

- `unavailableReferenceCount` comunica retirada sin filtrar títulos o identidades de referencias ocultas. Nuevos tests `test-s16-reference-preview-browser.mjs` y `test-s16-closure-auth-route.ts` pasaron. El primero usa API sintética: galería, cambio de imagen, reapertura con retirada, limpieza de campos/imágenes y 1440/390/320 sin overflow; revisión visual móvil realizada. El segundo acredita 401/403 antes de interpretar el body o mutar, para save/submit/proposal, con dobles de autorización.

- Segundo ensayo integrado `cd79f79d-d052-4e2b-b3a3-801303fc5df2`: pasó propuesta/aceptación, selector real, borrador privado, corrección, nueva versión, aceptación/constancia y cancelación histórica/replay. Falló al exigir 401: save devolvía 500 por no manejar `DiscoveryNeedsError`. Corregido en save, submit y proposal. La limpieza fallaba por el FK RESTRICT `ActivityLog.terraqoWorkspaceId`: ahora elimina primero solo recibos de cancelación de las colaboraciones sintéticas propias. Prueba PostgreSQL acotada con certificado, referencia y recibo de cancelación pasó y descartó el clúster.

- Tercer ensayo integrado `0fb508e3-7bc3-4db1-9ebf-0dfd6c459c3e`: 500 al primer GET de la página de cierre, antes de su formulario. Limpieza independiente **verificada** y entorno local descartado. El ensayo copió la UI antes del arreglo de acceso nullable a `selected`; no se conservó el log del servidor para atribuir definitivamente ese 500. Se corrigieron los accesos `revision` fuera de alcance y `selected` nullable. TypeScript, ESLint, diff-check y selector Chromium pasaron después. No presentar esto como prueba integrada del arreglo.



Límite de tres ensayos completos alcanzado; no iniciar un cuarto por repetición. Siguiente bloque acotado: prueba SSR/GET autenticada de la página S16 con captura estructural del error de servidor; una vez resuelto ese prerrequisito, reabrir checkpoint de integración con imágenes, retirada y limpieza. Después preparar wiring S16 del runner/plugin de staging, fijar candidato y validar alojado con datos sintéticos. S17/S18 no se dan por terminadas. Sigue pendiente la vinculación persistida de alcance aceptado: las comprobaciones temporales no sustituyen un snapshot histórico absoluto.





## 20 de noviembre — S15 validada en staging; siguiente S16/S17



Netlify confirmó `PASS S15 journey (operator media cleanup required)` para `78634938d6180a7c7c6b576f42fa0b602d9d6042`, deploy `6affd88d35cc1cec695753fd`. El marcador servido coincide. La ejecución `20338cd5-4b3f-44bb-b02a-9298836d43f9` pasó conversaciones entre empresa/profesional externo, borrador recuperado, envío/replay/conflicto, avisos neutros, aislamiento, adjunto real, propuesta explícita, bloqueo/reporte y revocación de membresía. El gate confirmó limpieza de BD mediante lectura independiente.



El operador local comprobó propietario, conversación y hash del único adjunto sintético, lo eliminó y confirmó ausencia mediante lectura fuerte. Recibo `output/s15-media-receipt.json.cleaned.json`. El SHA del recibo de logs estaba oculto por Netlify; se recuperó del candidato verificado por API y marcador, y el operador volvió a cotejarlo con el deploy. Se retiró el piloto S15 y se eliminaron los cuatro blobs S24 de `73b4b626-9d2d-4f63-959b-b7f36069d0ab`; lectura independiente de los cuatro: ausentes. S15 queda cerrada en staging. Sin migraciones, producción ni datos reales modificados.



S16/S17 continúan abiertas: corregir referencias cuyo CV/proyecto/permiso fue retirado y sanear la respuesta de guardado/replay; páginas propias según páginas 17–18 del PDF; selector y vista previa con autorización vigente; recorrido completo alojado. La auditoría `output/s16-reference-authorization.md` detectó que las comprobaciones anteriores de retirada eran insuficientes. No convertir sus pruebas locales previas en una declaración de cierre de fase.



Corrección legacy S16 validada localmente: `closure-reference-access.ts` centraliza CV habilitado/público, proyecto público vigente, propietario, raíz/revisión/hash exactos y exclusión de fuentes empresariales sin aprobación. Save/submit/decide/GET/replay usan proyección explícita sin snapshots ni hashes. Dieciocho escenarios PostgreSQL, rollback, replay y contención CV/ACCEPT pasaron; limpieza independiente y clúster temporal eliminado. La aceptación puede serializarse antes de una retirada concurrente; las lecturas posteriores redactan. No se promete que toda retirada concurrente gane.



Páginas propias `/admin/colaboraciones/[id]/cierre` y `/portal/colaboraciones/[id]/cierre` preparadas; el lookup exacto conserva el límite del tenant y evita depender de las primeras 100 colaboraciones. Mensajes enlaza al cierre en vez de incrustar el formulario completo. UI aislada pasó escritorio/móvil, sin modales; pendiente revisión final con selector y datos reales sintéticos. Primer ensayo integrado local `bca6a883-9cf2-4b23-b8fe-3a06b0730cea` se detuvo en propuesta antes del cierre y descartó el entorno local. El diagnóstico inicial no conservó la causa anidada; se agregó ubicación estructural y recibo de limpieza. Se reprodujo en Chromium que el selector nativo sin aria-label no coincide con su etiqueta exacta porque incorpora las opciones; se añadió nombre accesible explícito. No atribuir más fallos sin el siguiente ensayo. `scripts/verify-s16-collaboration.ts` sigue siendo control provisional, no certificación completa S16/S17.



## 20 de noviembre — S15 alojado: limpieza recuperada; fase abierta



Candidato `f4ac49a6be8f0e0a704076fef704abfd3d3f5c08`, deploy `6affd28aa4f478a393f7c50a`: compilación y marcador servido correctos, pero el plugin terminó `failed_plugin` en la comprobación independiente de limpieza (`s15-conversation-fixture.ts:35`). La ejecución `12abc76e-545e-4d80-b363-3fed88cbfb70` llegó a crear la propuesta explícita y el adjunto real; no demuestra el recorrido completo. El error de limpieza ocultó el fallo original. No cerrar S15 ni liberar producción.



Recuperación acotada completada: se verificaron propietario, conversación y hash del único adjunto sintético antes de eliminarlo; lectura fuerte posterior ausente. Se borraron los datos de esta ejecución dentro de una transacción, tras comprobar las cuatro identidades `@example.invalid` y el workspace exacto. Consulta independiente posterior: cero usuarios, workspaces, conversaciones y adjuntos de esta ejecución. Retirado el piloto temporal. Los cuatro blobs S24 quedaron eliminados y su lectura posterior confirmó ausencia. Sin migraciones ni datos reales modificados.



Corrección en curso: diagnóstico estructural de etapas, fallo del recorrido y limpieza por separado; resumen del plugin conserva las últimas etapas. Timeout de la transacción de limpieza S15 ampliado a 45 s para latencia remota, sin atribuir aún la causa a un timeout. Ensayo local completo PASS con ambas flags de colaboración/cierre (`85f0bd7b-afff-4519-8bb9-5f0c46218544`), Chromium y limpieza independiente. La documentación de Netlify confirma que Build Plugins no pueden escribir/borrar en stores globales: https://docs.netlify.com/build/data-and-storage/netlify-blobs/. Se separa la limpieza: el gate valida propiedad/hash y emite recibo; el operador local elimina y confirma ausencia con su sesión CLI, nunca un PAT inyectado al build. El resumen alojado acredita el recorrido, no el cierre de medios; S15 exige ambos recibos antes de cerrarse. Próximo paso: segundo intento alojado y limpieza local comprobada.



S16: la auditoría encontró `ActivityLog` como recibo transaccional apto para cancelación con motivo, actor histórico e idempotencia; puede implementarse sin una migración remota. Implementado y validado localmente: cancelación idempotente, autorización vigente bajo locks, exclusión mutua con cierre en revisión y rollback transaccional de auditoría. Pruebas PostgreSQL reales de carreras/replay/revocación pasaron y un observador confirmó cero filas en 13 tablas; clúster local eliminado. Ruta HTTP con dobles valida contrato y límite 8 KiB. GET publica solo id/nombre del actor histórico. Sin migración. Falta recorrido S16 alojado; no marcar fase completa.





S16 interfaz local: historial de revisiones completo desplegable en la página, extracto sin publicación implícita y constancia con alcance almacenado y fecha de Lima. Cancelación inline con motivo, conservación de payload/clave tras red incierta y aceptación oculta al cancelar. Veinte comprobaciones Chromium pasaron; revisión visual de historial móvil y anchos 1440/390/320 sin desbordamiento. Las pruebas de interfaz usan respuestas sintéticas: no sustituyen validación HTTP/BD alojada de S16. Evidencia `output/playwright/s16-ui/results.json` y capturas `history-*.png`.



## 19 de noviembre — S15 en validación; separación de rutas empresariales



S15 no está cerrado ni desplegado. La UI local pasó a 1440/390/375/320 px: solicitud de acceso como borrador editable, sin envío automático; vídeo contextual oculto; borradores por usuario y conversación; clave de reintento persistente; error de validación recuperable; respuesta tardía sin borrar otro borrador. TypeScript, ESLint y contratos de mensajería/colaboración pasaron.



Tres ensayos locales con PostgreSQL y sesiones reales detectaron fallos distintos. Se corrigieron acceso del profesional externo a su conversación aceptada sin crear membresía, DTO de decisión que exponía el ID del expediente y respuesta 500 en lugar de 403 para la vista empresarial. El tercer ensayo se detuvo porque `/admin/terraqo/mensajes` está bajo el límite global de `SUPER_ADMIN`; una empresa `ADMIN` recibe 307. La limpieza independiente quedó verificada (`e9b94f64-faef-49f8-8fd8-1ddf3912c777`). No repetir el recorrido completo en este ciclo.



Bloque independiente resuelto en local: crear `/admin/mensajes` con autorización empresarial, módulo y tenant vigentes; conservar intacta la restricción global; actualizar navegación, retornos y avisos. Separación validada con `scripts/verify-workspace-messaging-route.ts` y `scripts/lib/s15-local-rehearsal.ts --confirm=local-s15-only --route-only`. Empresa 200; panel global 307; profesional y anónimo redirigidos; módulo desactivado sin acceso. Limpieza independiente `a35c7a4f-e853-4868-bb6d-4005d225c100`. Tras resolver este prerrequisito se abre un nuevo checkpoint de integración, no se declara S15 cerrado.



Checkpoint posterior a rutas: el recorrido local pasó solicitud, rechazo/aceptación, acceso externo sin membresía, borrador recuperado, envío/reintento concurrente, avisos neutros, aislamiento, MIME/firma/tamaño rechazados y subida válida con lectura byte a byte y reintento sin duplicación. Limpieza de blobs y datos verificada (`67df808c-a167-4bef-8388-3ed445e5c039`). Se detuvo al crear propuesta: faltaba `TERRAQO_CLOSURE_V1=true` junto con colaboración, requerido por la política existente. Corregido el entorno y agregado a preflight. Pendiente integración final completa y gate alojado; no marcar S15 como PASS aún.



S16 privacidad: proyección por audiencia implementada. Profesional recibe solo revisiones enviadas (`submittedAt`) y conserva la última enviada si hay borradores posteriores. Se ocultan referencias retiradas y datos internos. PostgreSQL local aislado verificó cinco modos de retirada, replay sin aceptación duplicada y limpieza independiente. Falta integración HTTP/UI, reglas de alcance y resto del ciclo de cierre.



S16 controles adicionales validados en local: 16 comprobaciones UI (edición pendiente, referencias conservadas, recuperación de errores, alcance aceptado separado, condiciones y actores visibles); Chromium 390/1440 y Axe AA sin infracciones. Dos ejecuciones PostgreSQL probaron contención real de locks, ambos órdenes de carrera, rollback, constancia única y replay idéntico. Se bloquea cambio de alcance durante revisión del cierre y borradores anteriores a la última aceptación. Limitación: no hay snapshot persistido del alcance en el cierre; fechas históricas con desfase de relojes no prueban una vinculación absoluta. Fechas ausentes/inconsistentes/empatadas bloquean certificación. Algunos perdedores de carrera reciben serialización 40001 y deben reintentar. Sin migraciones ni cambios en producción.



Inventario siguiente S16: no exponer cierres DRAFT al profesional; conservar versión enviada e historial; bloquear cambio de alcance durante cierre en revisión; preservar referencias al editar y no enviar una revisión antigua si hay cambios locales; cancelación con motivo y auditoría. S17/S21 deberán mostrar condiciones, actores y contenido exacto antes de aceptar. Trabajo independiente de proyección privada en revisión; sin migraciones.



## 19 de noviembre — S14, evaluación privada validada en staging



Netlify registró `PASS S14 evaluation` para `e04a9c0c50ac35115e2dab8c86506b08621eee33`, deploy `6affca50b1a951c8ff948a23`. El marcador servido coincide. El recorrido alojado duró 4m 34.5s. Se guardaron criterios, notas y preguntas editables desde Chromium autenticado, se comprobó persistencia, reintentos idempotentes y conflictos 409. Los lectores anónimos, el profesional y otra empresa fueron rechazados en las operaciones privadas.



La pantalla sigue la composición navy en dos columnas del PDF. El visor abre en la página la versión exacta mediante una lectura con permisos vigentes y campos limitados al alcance original. La prueba usó una selección con solo título y otro acceso más amplio en paralelo. Revocar la selección devolvió 410, ocultó la fuente, el criterio y el resumen derivados, y mantuvo disponible la toma de notas manual. Se comprobaron anchos de 1440, 375 y 320 px. TypeScript, ESLint, los contratos existentes y la revisión visual local pasaron.



La ejecución `45523fa3-68cb-41bf-abaa-20f0430df227` confirmó limpieza mediante conexión independiente. Se retiró el piloto temporal y se confirmó la ausencia de los cuatro blobs de ensayo.



**Alcance pendiente del analizador.** Staging mantiene `TERRAQO_EVIDENCE_ANALYSIS_V1=false` y proveedor `off`. Se validó el recorrido manual y el rechazo 404 del análisis deshabilitado. Los estados de procesando, error, insuficiencia y revocación, así como la apertura de citas, se ejercitaron en la interfaz local con respuestas sintéticas. La generación real con proveedor externo y el fallo real 503 de un proveedor habilitado siguen pendientes. S15 es la siguiente pantalla del plan; conservar este pendiente de S14 en el cierre global.



## 19 de noviembre — S13 validada en staging



Netlify confirmó el plan Personal activo y completó el deploy `6affc4f04e7f96dd4744b7a5` del candidato `0eb38802d3ee08dfd88f45ba0c35737bb906496e`. El plugin registró `PASS S13 discovery`. El recorrido autenticado tardó 4m 24.7s y verificó filtros, agrupación por trabajo, selección del permiso exacto, imágenes y descargas byte a byte, y retirada del resultado y resumen derivado al revocar la fuente. Se comprobaron anchos de 1440, 375 y 320 px.



La ejecución `1292b55c-d5b5-41e0-9242-264e2aed562b` confirmó la limpieza mediante conexión independiente. Se retiró el piloto temporal y se verificó la ausencia de los cuatro blobs de ensayo. El marcador servido coincide con el candidato y deploy indicados. El bloqueo por cuota está resuelto. La siguiente pantalla es S14, evaluación y analizador.



## 15 de noviembre — S13, descubrimiento de experiencia relacionada



El candidato `6aab5e234f3e3e3d4aaafcfa9921fcb362db0e9c` pasó TypeScript, ESLint y los contratos de descubrimiento, análisis y permisos. Chromium local con dos sesiones autenticadas y PostgreSQL ejercitó filtros y agrupación por trabajo, fechas de Lima, disponibilidad publicada, vistas previas autorizadas y guardado de la versión y el permiso exactos en la evaluación. Tras revocar la selección, dejaron de mostrarse el resultado y el resumen derivado. El reintento de guardado recibió 409. Se probaron anchos de 1440, 375 y 320 px.



**Validación alojada pendiente.** Netlify omitió el build `6afa508bd241fe828f9b6f28`, deploy `6afa508bd241fe828f9b6f2a`, con el motivo `Skipped due to account builds usage exceeded`. El plugin no se ejecutó. Se retiró el piloto S13 y se comprobó la ausencia de los cuatro blobs sintéticos. El marcador servido corresponde todavía a S12, commit `cbfe11a`.



Cuando la cuenta vuelva a admitir builds, preparar los blobs del candidato, configurar el piloto S13 y relanzar la verificación. Comprobar el resultado `PASS S13 discovery`, el marcador servido y la limpieza antes de abrir S14.



## 15 de noviembre — S12, definir necesidad empresarial



Netlify confirmó `PASS S12 need` para `cbfe11ab76c25ffa5d12cff5021ec30e781d968f`, despliegue `6afa42b4edc76bf8717f985d`. El marcador servido coincidió. La prueba usó una empresa sintética con sesión real y Chromium a 1440, 375 y 320 px. La acción principal guardó una necesidad nueva y buscó evidencia con el ID devuelto. La acción secundaria guardó el borrador sin buscar.



Se reabrió la versión 1, se aceptó un criterio sugerido y se descartó otro, se añadieron requisitos obligatorios y deseables y se guardaron ubicación, disponibilidad, herramientas y respaldo. Las sugerencias pendientes bloquearon la búsqueda. La versión 2 conservó el contexto completo de 2400 caracteres. Una consulta verificó que la versión 1 y su evaluación permanecían intactas. Se comprobó la limpieza en otra conexión y se retiró el acceso piloto de la empresa sintética.



Se verificaron el contrato de descubrimiento, los permisos, la recuperación, TypeScript, ESLint y la presentación adaptativa. Para el recorrido alojado se probó el proveedor local de sugerencias; la generación con un proveedor externo no formó parte del ensayo. S13 (explorar experiencia relacionada) es la siguiente pantalla.



## 15 de noviembre — S11, detalle público y trazabilidad en staging



Netlify confirmó `PASS S11 record` en el candidato `f66348ebabfa4a390115ffacca50e67c292dac57`, despliegue `6afa3ca9cc5af6b7ac10190a`. Se comprobó el marcador servido. Chromium anónimo recorrió archivo, detalle, galería, descarga, respaldo, historial y retorno al archivo con foco y filtro conservados a 1440, 375 y 320 px. El enlace histórico con fragmento abrió la ficha y la acción de compartir copió el enlace canónico.



La ficha distingue autor, fecha del trabajo y fecha de registro en Lima. Se comprobaron los bytes de dos imágenes y la exclusión de archivos internos, coordenadas, nombres originales y comentarios del revisor en HTML y API. Tras retirar la bitácora, la ficha y los archivos devolvieron 404 y los metadatos coincidieron con un registro inexistente.



El respaldo heredado acredita el nombre del validador y la fecha de resolución. El esquema actual carece de autorización de publicación para la relación, el aspecto y la versión de un respaldo por invitación. Esos tres datos siguen privados. Para mostrarlos en el futuro se requiere una autorización de publicación explícita que pueda retirarse.



TypeScript, ESLint y los ensayos locales pasaron. Una consulta independiente posterior encontró cero perfiles S11 de prueba y el almacenamiento confirmó la eliminación de los cuatro objetos de ensayo. S12 es la siguiente pantalla del plan.



## 15 de noviembre — S10, archivo y calendario validados en staging



Netlify confirmó `PASS S10 archive` para el commit `9bee2e469be9d2d6b0bee6f272ea192e515665c1`, despliegue `6afa382872b2aa61dc8cd628`. El marcador del sitio coincidió. Chromium anónimo recorrió el archivo a 1440, 375 y 320 px. El primer lote trajo 20 de 28 bitácoras y el segundo las ocho restantes. Tras abrir una bitácora de la segunda página y volver, se conservaron los registros cargados, el foco, la selección y el desplazamiento (tolerancia de 4 px).



Se comprobaron búsqueda, tipo, estado, proyecto y rango combinados, los puntos del calendario, la aplicación explícita del rango seleccionado en orden inverso, la retirada del chip, el estado vacío y el reinicio del cursor. El visitante recibió conteos de 28 registros autorizados. Quedaron fuera de la lista, el calendario y las lecturas directas los cuatro controles privados, borrador, empresa y proyecto reservado. Se verificaron los límites de medianoche y fin de mes en Lima. PostgreSQL local también pasó los conteos con la búsqueda de texto completo activada y desactivada.



En el primer intento alojado se bloqueó el toque en «Cargar más bitácoras» a 375 px. El segundo identificó el iframe del distintivo de Netlify sobre el botón. El candidato final reserva espacio inferior en móvil. Otro navegador comprobó que el botón recibía el toque y cargaba los ocho registros restantes. La comprobación alojada confirmó la limpieza con una conexión independiente y una consulta posterior encontró cero perfiles sintéticos S10.



Referencia visual y contrato: [S10, archivo y calendario](../design/s10-ui-verifier-contract.md). La siguiente fase es S11. Esta entrega corresponde al entorno de staging.



## 15 de noviembre — S09, recorrido público del visitante validado en staging



Netlify devolvió `PASS S09 visitor` para el commit `c816b89dd4908cfb8ea8089502917525bb2e904e` y el despliegue `6afa2db0e17e6b757ef93e69`. El marcador servido por Terraqo Platform Staging coincidió después de la prueba. La producción quedó fuera del alcance.



Chromium recorrió el CV como visitante anónimo a 1440, 375 y 320 px. Abrió la bitácora desde la portada y desde el archivo, visualizó la evidencia, volvió al CV y descargó un PDF válido. El perfil vacío conservó el contacto permitido. Una cuenta de prueba inició sesión desde ese enlace y volvió al destinatario correcto. Se comprobó la diferencia entre un estado predeterminado y una disponibilidad declarada con fecha.



Las lecturas HTTP comprobaron la descripción y los bytes exactos de los adjuntos autorizados. Registros privados, borradores, registros archivados o eliminados y material empresarial fuera de la selección quedaron inaccesibles por sus enlaces directos. La autorización empresarial se probó con un caso de dos bitácoras, solo su contribución y las fotos seleccionadas. Al revocarla se volvieron a comprobar el CV, el caso, las páginas de detalle y los archivos. La invitación limitada también se verificó antes y después de su revocación. Los controles buscaron datos de cliente, documentos y coordenadas privadas en las respuestas públicas.



La prueba alojada comprobó la limpieza de filas sintéticas. La lectura independiente posterior confirmó la ausencia de los cuatro objetos del lote `b8f22de2-aaaf-4f67-af0f-910c46d97239`. El ensayo local completo `b278dc80-92bb-471f-b6ea-d80b97e21956` también pasó. El commit posterior `d871752` ajusta únicamente la preparación de datos en el verificador y su ejecución local. Véase [el contrato visual S09](../design/s09-ui-verifier-contract.md). La siguiente fase es S10.



## 15 de noviembre — S08, revisión por aspecto validada en staging



Netlify confirmó `PASS S08 review` para el despliegue `6afa26bbf1e891029796a88c`. El marcador independiente devolvió el mismo despliegue y commit `116d8655e6887059a5d04d5ef0e8b5f64306ef08`.



Desde el aviso de la bandeja, el revisor abrió la solicitud específica y respondió tres aspectos con las tres decisiones posibles. Se comprobaron el comentario obligatorio para pedir aclaración, el alcance visible, el resumen y el resultado persistido. Al perderse la respuesta de red después de registrar la decisión, la repetición desde la interfaz recuperó la misma decisión sin incrementar dos veces la versión.



Se probaron la revisión personal, la autoridad empresarial vigente y su retirada mientras el formulario estaba abierto. Las asignaciones empresariales de prueba se prepararon en PostgreSQL; el revisor abrió y respondió desde la aplicación autenticada. La versión original siguió disponible tras editar la bitácora. Una revisión antigua sin fecha o lugar originales quedó bloqueada para esos aspectos. Las pruebas visuales cubrieron 1440, 375 y 320 px y texto al 200 %.



El verificador comprobó la limpieza de las filas sintéticas. La inspección independiente encontró ausentes los cuatro objetos del lote `b80d80f1-286e-4e67-9598-0858c60794ad`. La siguiente fase es S09.



## 15 de noviembre — S07, solicitud de respaldo validada en staging



Netlify confirmó `PASS S07 endorsement` para el despliegue `6af9fc02f1f2bf1e444f1ca4`. El marcador del sitio sirvió el commit `96c14fbabf50a33930c33d021ccc5b055039f981`.



El recorrido comenzó en una bitácora y comprobó la revisión preseleccionada, el borrador privado, la confirmación del destinatario, el envío directo y el envío desde un borrador. Al perder la respuesta de red, el reintento recuperó la misma solicitud. Con tres cuentas sintéticas y una sesión anónima se verificaron la identidad por correo verificado, la proyección de campos y el aviso interno. El recordatorio conserva la fecha de envío inicial y solo se permite una vez cada 24 horas.



Se verificó la caducidad y la revocación posterior a una decisión. El autor conserva el comentario y su trazabilidad, y el destinatario pierde acceso al contenido. El verificador comprobó la limpieza de sus filas y la lectura posterior confirmó la ausencia de los cuatro archivos de prueba del lote `b125380b-6721-4df5-b98f-5d13190ecf40`.



La revisión visual se realizó en Chromium a 1440, 375 y 320 px. El primer candidato tenía una cadena en codificación incorrecta en el aviso interno. Se corrigió antes del despliegue validado. La siguiente fase es S08.



## 15 de noviembre — S06, destinos y autorización empresarial validados en staging



Netlify registró `PASS S06 visibility` para el commit `93e0aa96ef010513376796396125963315591eb6` y el despliegue `6af9cc4b8986b4ac75c44464`. El marcador del sitio confirmó ambos identificadores. El recorrido usó tres sesiones autenticadas de prueba y una anónima.



- Privada por defecto. Guardar mantuvo los campos y adjuntos fuera del acceso público y de terceros.

- Pública. Se comprobó la aparición en el CV cuando se elige ese destino, la continuidad de enlaces anteriores y la retirada de la publicación.

- Por invitación. El acceso requiere el correo verificado del destinatario y respeta el alcance, la vigencia y la revocación. El enlace se comparte manualmente.

- Material empresarial. Se probaron ambos destinos desde la solicitud hasta la revocación, con inspección de campos y fotos por el revisor. Tras recargar, el titular pudo confirmar en «Tus selecciones» el destino aprobado. Cambiar destinatario, vigencia o permiso de descarga requiere otra autorización.



La primera ejecución descubrió un selector de prueba que aún esperaba la confirmación en el formulario inicial. La segunda completó el flujo persistido. La inspección posterior confirmó la ausencia de los cuatro objetos de prueba del lote `84f420ed-8eb2-4f21-b3b7-3d62059167f4`. La siguiente fase es S07.



## 15 de noviembre — S06, vista previa de archivos en staging



El despliegue `6af9c06f61278dff45729fc0` sirvió el candidato `cee497b9a4607c1ecc9a0c30505fb8228fb66f77`. El verificador autenticado abrió Selecciones, mostró la descripción elegida, mantuvo oculto el título y decodificó dos fotos mediante la ruta privada del titular. Desmarcar los adjuntos retiró la galería. El plugin confirmó PASS para el candidato y el operador verificó la ausencia de sus seis objetos sintéticos.



Chromium local pasó a 1440, 375 y 320 px e inspeccionó el payload de creación: recorrer, marcar y desmarcar antes de guardar no escribió permisos. El selector respeta el contrato actual de adjuntos WebP normalizados. Cuando el registro incluye otros formatos permite compartir los campos de texto. Siguiente pendiente de S06: contrastar el recorrido completo de visibilidad privada, pública y por invitación con el PDF, incluida la autorización empresarial cuando corresponda.



## 15 de noviembre — S03/S04, cierre web de fecha, multimedia y borradores



Staging sirvió el commit `2d060e5e3138af96f08dccacb6f84677abd672c9` en el despliegue `6af9bc3a0ecdd05f329c429f`. La suite autenticada terminó con PASS para ese despliegue.



- Se creó una bitácora privada con fecha de trabajo del 14 de octubre. PostgreSQL conservó ese día en Lima y registró la hora efectiva de publicación por separado. La fecha sobrevivió a la edición en otro dispositivo y, en la prueba local, a un reintento de publicación tras recargar.

- Se adjuntaron y reprodujeron audio y vídeo WebM por HTTP, se reintentó la carga y se comprobó el acceso antes, durante y después de publicar la evidencia sintética. La prueba local cubrió también MP4 y la grabación con dispositivos simulados. Límite por clip: 3 MiB.

- Dos sesiones Auth.js del mismo profesional editaron un borrador con fechas diferentes. Una escritura simultánea recibió 200 y la otra 409. La resolución conservó ambas versiones y se comprobó que otro perfil no podía leerlas. La sincronización de cuenta incluye campos y enlaces. Los archivos pendientes permanecen en el dispositivo de captura.

- La suite retiró las filas sintéticas. El operador verificó por lectura la ausencia de los dos clips del recorrido y de los cuatro objetos auxiliares S24. El descarte del borrador conserva únicamente su revisión para rechazar escrituras atrasadas.



Alcance de este cierre: plataforma web de staging. La captura nativa Flutter y las pruebas físicas de cámara y micrófono no forman parte de esta ejecución.



## 15 de noviembre — S03/S04, captura y revisión web en staging



El candidato 583f84cc0100dc6e7895dfb3e098341ef7e06dc3, despliegue 6af9b5e10d4a902bb123b293, pasó la suite S22 y el nuevo recorrido autenticado S03/S04. Se seleccionaron dos imágenes, se abrió la segunda en la galería, se revisó el resultado y se volvió desde la visibilidad privada. El conteo en PostgreSQL acreditó que avanzar y volver no creó una publicación. El primer candidato había fallado antes de llegar al recorrido en la API de miembros (500); no se reprodujo en la ejecución final. La limpieza confirmó cero fixtures S22 y cuatro objetos externos ausentes.



Chromium local a 1280, 375 y 320 px comprobó edición sin red en la página abierta, restauración del borrador consentido al recargar tras reconectar y reintento de fotos después de una publicación simulada. Se corrigió la reposición de una foto ya adjuntada en la cola local al recargar. Las pruebas simularon fallo de primera o segunda foto y comprobaron una creación y solo los reintentos pendientes. La maqueta incluye audio/vídeo y fecha editable; el contrato web comprobado admite fotos y enlaces y conserva la fecha real de registro. Quedan pendientes la reconciliación de conflictos de revisión entre dispositivos y la validación de captura móvil nativa.



## 15 de noviembre — S01/S02, recorrido autenticado en staging



El marcador público confirmó el candidato `6c0e759abfda295b360fe70fbd11c3343ef2e15b` y el despliegue Netlify `6af9b0d19d4799073dd41424`. Chromium abrió una invitación sintética como visitante, inició sesión mediante el formulario de credenciales real en una segunda pestaña, comprobó la identidad devuelta por Auth.js y volvió a la primera. Se verificó que el acceso de evaluador solo se concedía al pulsar Aceptar y que después se abrían las evaluaciones autorizadas.



El portal autenticado mostró el pendiente de documentos y la bitácora del profesional a 1280, 375 y 320 px. Se comprobó la disposición lateral de pendientes en escritorio, su posición antes de actividad en móvil y la ausencia de desbordamiento horizontal. La comparación visual local de la pantalla completa empleó tres entradas sintéticas, con capturas en output/s01/full-trajectory-{1280,375,320}.png. El estado sin fotografía usa el icono del registro. La suite S22 completa pasó en este despliegue. Una ejecución anterior había llegado al final de ambos recorridos con un fallo agregado de consola cuya causa no se pudo atribuir; no se reprodujo con el diagnóstico adicional y el candidato final.



El verificador retiró sus filas y confirmó cero fixtures S22. Los cuatro objetos preparados se retiraron y su ausencia se verificó por lectura. No se enviaron correos ni se desplegó en producción. Próximo bloque visual: S03/S04, captura y revisión del borrador.



## S01/S02 — Retorno a la invitación y borrador prioritario, validación local



Referencia contrastada: páginas 2 y 3 de 02-ui-ux-pantallas.pdf. En S01 la invitación permanece en la pestaña original mientras se inicia sesión o se crea una cuenta en otra. Al volver se consulta la sesión y la aceptación sigue siendo explícita. El secreto del fragmento se mantiene en memoria. En S02 el inicio profesional cuenta con acceso prioritario al borrador local consentido del perfil y destinos a captura, organización, respaldo y documentos según los módulos disponibles.



TypeScript y el recorrido de invitaciones existente pasaron. Chromium local comprobó a 1280, 375 y 320 px los dos estados del acceso al borrador, aislamiento entre perfiles y retorno a la invitación con sesión simulada y una sola aceptación. Las capturas locales corresponden a los componentes, no a un recorrido autenticado alojado. Pendiente: probar con dos pestañas y autenticación real en staging, validar los destinos integrados del panel y contrastar actividad y pendientes con la composición completa de S02.



## 14 de noviembre — S10/S11 y S24 validados en staging



El diagnóstico del calendario confirmó un registro el 28 de octubre y otro el 29 en America/Lima. Antes de la corrección, Netlify Durable y Edge reutilizaban el conteo global de dos registros al pedir el rango 27–28. El listado y el calendario ahora usan respuestas privadas sin almacenamiento compartido. La misma consulta contra el candidato corregido devolvió un registro y el diagnóstico independiente confirmó que la interfaz actualizó el conteo.



El candidato servido `1146af90bcff42ccfe957be813553fa3eecbed67` pasó S22 en el despliegue `6af92db51f750eb42d0c29b2`. El diagnóstico `6af92f9d496b04f2b2c86cba` pasó S10/S11 en Chromium a 1280, 375 y 320 px: selección inversa de fechas, aplicación explícita, dos planos en la galería, regreso con filtros y limpieza del periodo. También pasó S24: alcance y revocación de evidencias y casos, con la base de datos conservada. Se retiraron y verificaron ausentes los cuatro objetos sintéticos. Producción queda pendiente de la revisión visual restante y los controles de lanzamiento.



## 14 de noviembre — Calendario y galería pública en staging



Netlify sirve el commit `7ffa85a3fefe1e4d2ead956f7cea49207360798d` en el despliegue `6aed0e62e406fbe3eec5b74c`. El registro confirma PASS S22 con retirada de sus fixtures. Las pruebas locales del contrato del archivo, los parámetros de navegación y los cuatro objetos sintéticos pasaron.



En el diagnóstico `6af9296c8fa8e6c9bdd4c8e3`, la API anónima devolvió 200 y dos bitácoras. Un segundo Chromium abrió el archivo y la galería del mismo perfil sintético en escritorio y móvil. Las capturas muestran las fechas 28 y 29 de octubre en Perú y el segundo plano seleccionado dentro de la página. Las imágenes están en `output/s10/` del checkout de validación.



S10/S11 sigue abierto. El Chromium del diagnóstico se detuvo al buscar el botón del 28 de octubre con un registro, antes de aplicar el rango. El informe no incluye la respuesta de la consulta mensual. La siguiente comprobación debe capturar el estado HTTP y los conteos de la consulta de actividad de octubre y compararlos con el mes y las etiquetas renderizadas en cada ancho. Quedan sin acreditar el regreso con rango conservado, la ejecución a 320 px y S24 contra este candidato.



Se desactivó el diagnóstico y se confirmó la ausencia de sus cuatro objetos. Una consulta independiente en staging devolvió un usuario, un workspace, una invitación con checksum histórico conservado, 48 migraciones y cero concesiones, expedientes, casos, bitácoras, medios y revisiones. Producción quedó fuera de esta ejecución.



## 5 November, 14:00 Lima — S24 verificado y calendario del archivo corregido



**S24 pasó contra el candidato servido** `e1428e5b5f6f7719850b4f49d257664574974022` en Terraqo Platform Staging, despliegue `6aecc73d152fd923d7860673`. El diagnóstico anterior contra `fa8c412` aisló el fallo en la creación del expediente (Prisma P2028). La concesión privada había devuelto 200 al revisor, 404 a otra persona y 404 para descarga. El nuevo servicio carga las revisiones en lote, reutiliza las proyecciones vigentes, inserta las fuentes en conjunto y mantiene la transacción serializable con un plazo explícito. El ensayo local reproduce los permisos de lectura y escritura sin facultad de crear esquema.



El primer trabajo de Netlify que publicó el candidato agotó el tiempo de ejecución tras crear el expediente. La comprobación independiente `6aecced28f7c0cbd16620527`, ejecutada con el código de diagnóstico `dcdcdfb`, verificó el marcador servido antes y después. Recuperó únicamente las filas sintéticas identificadas por usuario, workspace y manifiesto de medios. Pasaron la aprobación mediante Chromium, dos imágenes permitidas y dos excluidas, el vencimiento de la concesión, la revocación de rutas y bytes, los lectores de descubrimiento/expediente/contexto/análisis y el recorrido del visitante CV → caso → evidencia → volver. La prueba comparó el contenido de 23 tablas. Netlify canceló el build de diagnóstico deliberadamente después de registrar PASS, para conservar el despliegue comprobado.



Lectura posterior independiente: un usuario, un workspace, una invitación histórica con checksum conservado; cero concesiones, expedientes, casos, bitácoras, medios y revisiones. Se comprobaron ausentes los cuatro objetos del diagnóstico y se desactivó su modo de ejecución. El ledger conserva 48 migraciones. Este bloque no envió correo ni desplegó en producción.



**S10/S11.** Se revisaron las páginas 11 y 12 de la referencia visual. El calendario aplicaba un día al tocarlo y carecía de confirmación cuando se abría sin filtros. Ahora permite elegir un día o ambos extremos en cualquier orden, conserva la URL y los resultados mientras se elige, aplica mediante un botón y permite quitar todo el periodo con una sola acción. El archivo conserva el enlace al CV en la navegación principal. Chromium local pasó lista, calendario, detalle, galería en página, enlaces históricos y vuelta con filtros a 1280, 375 y 320 px, con datos sintéticos. Este ajuste de interfaz es posterior al candidato servido. Pendientes de lanzamiento: incluir el ajuste de calendario en el próximo candidato, validar S10/S11 con medios representativos en staging, continuar la revisión visual restante y resolver la configuración de correo S22.



## 5 November — Resultado alojado



Staging sirve `fa8c41257c53ec612904ff172f68be71d39203ff` (Netlify `6aecbb879405efadfb226e52`). S22 pasó con sesiones Auth.js, Evaluador, aislamiento por empresa y limpieza. La prueba S24 llegó a la aprobación en Chromium y a la publicación de dos imágenes autorizadas. Se verificaron los bytes seleccionados y las denegaciones de los adjuntos excluidos. Los dos ensayos previos corrigieron el clic antes de la hidratación y la comprobación de rutas de imagen en el despliegue.



**S24 sigue abierto.** El tercer ensayo falló en `checkGrantBoundary` (runner, línea 230). El log alojado solo conserva la línea de llamada. Por ello no permite distinguir el fallo de la concesión del fallo en la lectura del expediente. El candidato no acredita todavía el vencimiento de la concesión, la revocación ni la navegación alojada del caso. Próximo paso: reproducir esa comprobación de forma aislada con los permisos del rol staging y la misma política de acceso, utilizando diagnósticos de línea acotados. Evitar reconstrucciones completas hasta aislar la discrepancia.



Se retiraron los cuatro objetos de cada una de las tres ejecuciones y se verificó su ausencia. La lectura independiente en Supabase tras el último ensayo dio un usuario, un workspace, una membresía, la invitación histórica con el mismo checksum, 48 migraciones y cero casos, revisiones y medios de prueba. El marcador HTTP devolvió el commit esperado. Producción y el correo de clientes quedaron fuera de estos ensayos.



## 5 November — Candidato de casos públicos y permisos de evidencia



S05/S09 ahora requiere que el titular elija publicar una selección como caso. Una agrupación privada por sí sola conserva su privacidad. En los casos de empresa, la autorización abarca el destino de publicación, la versión y los campos seleccionados. El CV, el índice, el detalle y las imágenes vuelven a comprobar el permiso al navegar. Las pruebas locales de PostgreSQL y Chromium cubren selección ordinaria, caso explícito, revocación y navegación en escritorio y móvil.



S24 cubre dos registros con dos adjuntos cada uno. La revisión obsoleta y la concesión que vence durante una lectura de almacenamiento pierden acceso a los bytes. Los ensayos locales verifican también versiones obsoletas, lectores secundarios, limpieza tras fallo y conservación de las filas iniciales. El operador de staging prepara y recoge cuatro WebP sintéticos con un manifiesto de propiedad y sin entregar una credencial de operador al build. La prueba de aceptación de Netlify/Chromium queda preparada para ejecutar estas comprobaciones sobre el próximo candidato.



S22 conserva el envío general desactivado en staging. El modo de prueba acepta únicamente el simulador de Resend, con etiqueta de invitación y destino sintético. Las pruebas locales cubren denegación de correo real y repetición sin duplicados. Netlify devolvió HTTP 403 al crear la credencial protegida exclusiva para Functions. La credencial temporal de Resend fue revocada. Falta validar el despacho automático alojado; la invitación de prueba del 4 de noviembre permanece bajo su autorización original.



La compilación local generó 102 páginas. Pasaron los recorridos de atención autenticada, contacto, asignación, replay y aislamiento de empresa. El primer ensayo de atención terminó sin diagnóstico del subproceso; el segundo completó la batería y la compilación. La validación alojada del nuevo candidato y la revisión visual de las demás pantallas siguen pendientes. Este bloque no requiere migración.



4 November, 23:23 Lima. Evaluator migration 48 and candidate `58196fd` are verified on Terraqo Platform Staging, deploy `6aec040f55e368e91f60e443`. The hosted authenticated browser gate and independent database cleanup checks passed. The authorized mail-test invitation was preserved. See `s22-evaluator-release.md`. Remaining release work includes automatic invitation delivery configuration, public WorkCase navigation and the outstanding visual and S24 acceptance gates.



S22 follow-up, 4 November (Lima). The ordinary-workspace access policy now explicitly lists the existing roles. Private evidence, storage, collaboration and brand mutations check tenant authority, and administrative evaluation reads and replays check the live actor and dossier. Disposable PostgreSQL tests cover cross-workspace replay, archive, demotion and loss of access during upload. The authenticated browser flow passed with disabled mail. Evaluator issuance and the grant tying a reviewer to a specific dossier remain open.



Invitation creation and rotation now attempt delivery after the database commit. A provider timeout preserves the manual link. Replaying creation does not duplicate email, and a stale rotation cannot issue another link. The integration passed with a simulated provider. A separately authorized live probe used the existing staging API to issue one viewer invitation, rendered the application template, and sent it using the Resend connector. Resend reported delivery. The test workspace, disabled issuer login and pending invitation are intentionally retained until the link expires on 11 November at 22:51 Lima time. Keep the token out of logs. Hosted automatic delivery still requires a sender and provider credentials in the target environment.



Latest checkpoint, 4 November: **S22 core hosted gate PASS**. Explicitly authorized migration applied only to staging; ledger 47/0 unfinished. Candidate `c717bd5e76d7791529525c29a91887a5879c025b`, deploy `6aebe18dd27a103cc121c1e3`, passed real authenticated browser acceptance and exact fixture cleanup, independently checked through Supabase and HTTP marker. Production unchanged. Next executable S22 work: Evaluator/granular permission semantics and invitation delivery integration; then continue the ordered WorkCase/visual/S24/release gates below. Do not replay the completed staging migration or treat this core gate as full S22/public release completion. Detailed evidence: `s22-staging-gate-2026-11-04.md`. Older checkpoint paragraphs are historical.



Latest S22 backup phase: fresh actual staging dump restored and migration rehearsed locally with preserved entity counts; real provider role/default-grant audit checked read-only. Next: controlled staging schema application and hosted gate. Do not repeat the already completed synthetic/actual restore work unless the candidate or provider state changes. See `s22-staging-gate-2026-11-04.md`.



Latest S22 gate: dedicated hosted verifier and local SQL-wrapper rehearsal implemented; full combined Next.js build and S22/attention authenticated regressions pass. Read-only staging audit verified 46 migration checksums and the missing invitation migration/table. Next executable phase: fresh staging backup/restore and actual role/default-grant audit, followed by controlled schema/hosted acceptance. Details: `s22-staging-gate-2026-11-04.md`. Synthetic build artifacts must not be deployed. Evaluator/granular permissions and real email integration are still open.



Latest reconciliation: S22 now incorporates attention release `285b20a`; both authenticated local suites pass sequentially. Candidate also includes earlier S23/S24 changes. See `s22-release-reconciliation-2026-11-04.md`. Next executable gate is hosted S22 verifier/flag and migration-readiness preparation, not a blind deployment. Evaluator permissions, email delivery and hosted acceptance remain unfinished.



Latest S22 local gate: authenticated Next.js + PostgreSQL + Chromium now passes without hydration/runtime/500 diagnostics. Hydration warning was caused by screenshot caret mutation; corrected the harness. Lost workspace access returns notification-pulse 403 and stops client polling, verified beyond both polling intervals. Next: reconcile released attention changes and prepare staging preflight; Evaluator/granular permissions and email delivery remain unfinished S22 requirements. Details at the top of s22-workspace-administration-2026-11-03.md. No hosted environment changed.



Use with visual-reconciliation-2026-11-02.md. This is an ordered execution queue, not a percentage or a release declaration. S06/S07/S08 interaction fixes are in staging candidate 2ece409; S18 inline revocation is local commit 1427d37. The candidate's postdeploy S23 acceptance PASSED, including hosted expiry and revocation. Independent readback confirmed zero synthetic users/requests/collections/worklogs.



## Next executable blocks



1. CLOSED: S23 expiry/revocation gate, candidate 2ece409ccc920c0da317f80b8a9a35c571c45dd7, deploy 6aea2a045ee12c88f761c44c. Marker, onSuccess PASS and independent zero-fixture readback verified. This does not certify the hosted S08 review form or broader reference fidelity.

2. Include the S18 confirmation change in a later candidate after the current gate finishes. The S23 owner expiry selector has been narrowed to its complete accessible name to avoid ambiguity with the newly labelled manual-grant field. No additional migration.

3. Complete S22 workspace administration separately from operational teams. Current `TerraqoWorkspaceMember` has active/invitedAt/joinedAt and roles OWNER/ADMIN/MANAGER/MEMBER/VIEWER/CLIENT/PROFESSIONAL, but no full workspace invitation lifecycle. Audit effective authorization before adding any UI. Existing write paths requiring last-admin protection: `updateMembershipAction` in app/admin/terraqo/usuarios/page.tsx and `unlinkStaffAccessAction` in lib/server/admin-actions.ts; inspect creation/upsert/deletion paths too. Guard the entire mutation transaction, including unlinking the staff user; serialize per workspace and test two simultaneous demotions/removals. Preserve historic authorship and personal profiles. Invitation acceptance must bind verified identity, workspace, minimal role, expiry and single-use token; store only token hash. Add cancel/rate-limited resend without implicitly delivering mail or granting access. Rehearse any additive migration locally before staging application.

4. Public WorkCase navigation (S05/S09): distinguish recent individual bitácoras from an authorized grouped work case; preserve field projection across CV, list, case and canonical evidence detail. Add back/forward/URL-state and revoked-source coverage.

5. Remaining visual reconciliation: S01/S02 access/trajectory; S03/S04 capture/draft/conflict; full S06–S08 composition/media/context navigation; S09–S11 hosted CV/archive/detail; S12–S17 discovery/conversation/closure; S18 plan/documents; S19/S20 mobile/offline/session recovery; S21 proposals. Consult exact source pages before editing. Existing technical tests do not certify screen fidelity.

6. S24 broadened hosted acceptance: selected attachment bytes, stale request versions and downstream readers, with exact permitted field/media scope and cleanup. Do not treat the prior core gate as full coverage.

7. Release gate: whole candidate diff, migration/backup/rehearsal evidence, explicit target/flags, E2E/navigation and rollback plan. Run only the reviewed production procedure when all required gates pass; do not equate a staging deployment with a public rollout.



## External evidence gaps



S22 progress: local last-admin guard, atomic staff unlink and preservation of existing authority during professional-affiliation approval are implemented and tested against disposable PostgreSQL. See s22-workspace-administration-2026-11-03.md. Invitation lifecycle and hosted/admin browser acceptance remain open; item 3 is not complete.



- Three historical missing media blobs need original bytes or external copies. A reference or URL cannot reconstruct the files.

- Physical-device/screen-reader acceptance is distinct from desktop browser viewport testing.

- Real email receipt requires its own authorized delivery test; mocked HTTP and UI messages are not delivery proof.



No new production operation, migration, payment or customer mutation is performed by this document. Daybreak remains excluded.



4 November S22 update: invitation model/service, bounded authenticated routes, page-23 members/invitations UI and shared recipient acceptance implemented locally. Workspace-scoped role/suspend/reactivate controls now include authority hierarchy, last-admin guard, stale-version rejection, atomic audit and inline confirmation. Disposable PostgreSQL lifecycle/concurrency tests and synthetic Chromium component tests pass. Remaining: Evaluator/granular-permission semantics, delivery integration and real authenticated/hosted acceptance. Next executable block is local authenticated Next.js E2E with disposable PostgreSQL. See latest S22 checkpoint; item 3 remains open. Active isolated tree: `icc-topografia-s22`, branch `codex/s22-workspace-admin-20261104`; reconcile live attention release before any deployment.
