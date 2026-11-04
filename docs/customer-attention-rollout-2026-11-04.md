# Atención y conversión — prioridad 4 noviembre 2026

S22 queda PAUSADO por solicitud del usuario. Conservar sus cambios locales; no incluir su migración en esta entrega.

Fuente de alcance: C:/Users/Binv/.codex/attachments/1124a72d-aac4-40ab-9495-b4b77f56d23f/Pasted text.txt.
El usuario confirmó **todos** los recorridos para esta actualización: atención/seguimiento, configuración por workspace y vínculo comercial/resultados. No considerar la bandeja como entrega completa ni publicar un subconjunto sin comunicar el alcance.

## Implementado localmente
- Bandeja /admin/chat: búsqueda, filtros, paginación, selección URL, vista de conversación/contexto, navegación móvil sin modal, historial paginado, actualización 30s que respeta foco de formularios.
- Asignación transaccional: una sola toma concurrente, permisos bajo bloqueo por conversación, no robar responsable al responder, cierre conserva historial.
- Respuestas y notas internas idempotentes; bitácora de auditoría de acciones. Las notas quedan fuera del DTO público.
- Próxima acción, fecha y completado; cierre de seguimiento rechaza la fecha obsoleta. Formulario indica hora de Perú y que no envía avisos externos.
- API pública limita multipart a 40KB/8 partes, campos y mensaje; DTO mínimo del asesor. Inicio y mensajes idempotentes para widgets actualizados, notificaciones en la misma transacción; compatibilidad con widgets antiguos sin operationKey. Límites persistentes por minuto.
- Ambos widgets conservan texto ante fallo, dejan de prometer presencia, conservan historial resuelto. El widget ICC tiene nuevas superficies claras, objetivos táctiles y recuperación del polling al volver internet.

## Dos repositorios
- Plataforma: C:/Users/Binv/Documents/New project/icc-topografia, codex/platform-staging-release. Cambios de S22 ajenos a esta prioridad siguen sin commit.
- Sitio ICC: C:/Users/Binv/Documents/ICC TOPOGRAFIA. Solo se editaron app/components/TerraqoChatEmbed.tsx y app/globals.css para esta tarea; hay MUCHOS cambios móviles preexistentes, preservarlos.

## Validación real
- scripts/rehearse-customer-attention-local.mjs --confirm=local-attention-only: PostgreSQL18 efímero, SQL incremental real, pruebas de aislamiento, toma concurrente, notas/respuestas idempotentes, seguimiento, inicio/mensaje público y notificaciones sin duplicados. PASS.
- TypeScript plataforma e ICC PASS; ESLint focalizado PASS; detector Impeccable [] antes de añadir seguimiento/notas; Prisma validate PASS.
- Fixture real AttentionInbox en localhost:3190/admin/chat (servidor exec sesión 18539), scripts/fixtures/attention-inbox.tsx. Datos sintéticos, acciones simuladas. Navegación lista-detalle-volver PASS móvil, sin overflow. NO certifica autenticación HTTP.
- ICC dev localhost:3192 (exec sesión 74044). Prueba Playwright con /api/terraqo/chat interceptado: fallo de red conserva texto y vuelve habilitar enviar, sin overflow. No enviamos mensajes reales.
- Capturas en C:/Users/Binv/Documents/ICC TOPOGRAFIA/output/attention-desktop-first.png, attention-mobile.png, customer-widget-mobile.png. Las primeras capturas preceden notas/seguimiento: falta ronda final con UI actual.

## Staging
- Supabase confirmado Terraqo Platform Staging mghdpciewbsowjrjwmwk ACTIVE_HEALTHY.
- Respaldo output/s24-backup-1793788211798/icc.dump, SHA256 17e792207c5b76db79bb3e79f4e62e2237ad8de186c42c9c0a07416bffbe2090, 645640 bytes.
- Restaurado localmente y ensayado SQL con scripts/restore-attention-staging-local.mjs; preservación de conteos, bloqueo de instalación duplicada y permisos PASS.
- Aplicada SOLO en staging la migración 20261104000200_customer_attention_followup mediante Supabase apply_migration.
- Readback: 46 migraciones, 3 columnas, checksum a7f498f903d18ce459c2f12e32cb4dde3a36006e6a92480831f9b787ba8cde57, sin acceso anon/authenticated, permiso SET migrador revocado, 0 seguimientos con datos.
- SQL guardado output/attention-staging-migration.sql y ledger previo output/attention-staging-ledger.json. Generador scripts/prepare-attention-staging-migration.mjs.
- Staging APP sigue candidato 2ece409 / deploy 6aea2a045ee12c88f761c44c. Todavía no se publicó código de atención.
- Producción plataforma sigue deploy 6ae7ec06e99b195a657aa8be. Sitio Netlify 2d38524a-44f9-4473-8a1f-9270e03bc2bf, rama codex/icc-production-preview. Producción NO modificada.
- Sitio ICC .netlify/state.json: 5e1adf1c-580a-46e3-8854-e6a795cc7c73.
- Evitar CLI env:set: incidente previo apuntó a sitio equivocado. Usar SDK con siteId explícito/aseveraciones y nunca imprimir secretos.

## Siguiente bloque ejecutable
1. Configuración por workspace: identidad, motivos, horario/zona, dominios, borrador/vista previa/publicación/rollback. Reutilizar TerraqoWorkspace.settings con esquema versionado y bloqueo de fila; no pisar otras claves.
2. API/widget multiempresa: hoy /api/chat aún resuelve DEFAULT workspace. Debe quedar resuelto por workspace/dominio autorizado con acceso seguro a historial; no afirmar aislamiento completo del widget multiempresa hasta hacerlo. IDs actuales actúan como handle bearer heredado; diseñar recuperación segura sin exponer registros privados.
3. Comercial: crear/vincular oportunidades del mismo workspace y cotizaciones/pedidos, mostrar evidencia distinta de venta declarada/pago. Opportunity exige Company; no inventar empresa ni sumar monedas. Atribución deduplicada, sin cobros.
4. Métricas con período y denominadores reales; panel global agregado, nunca textos/contactos.
5. Validación HTTP con dos workspaces, flujos navegador actuales, recuperación y fallos. Revisión diff completo, candidato aislado del S22 pausado, staging deploy/tests/cleanup.
6. Solo entonces preparar y publicar ambos destinos autorizados con respaldo/rollback y verificación de producción. No afirmar actualización publicada antes.

Riesgos pendientes: límites/rutas de chatbot heredado y su pérdida de contexto al derivar; historial público sin paginación; conflicto de transferencias explícitas; falta configuración y recuperación entre dispositivos. No prometer avisos por correo/WhatsApp hasta implementar cola/entrega. Canales avanzados y cobros reales no forman parte de las pruebas autorizadas.

## Ampliación validada en esta continuación
- Configuración con revisión concurrente, borrador/publicación/rollback; preview desktop y móvil. Ambos widgets consumen configuración publicada. El API acepta workspace explícito; rechaza workspace inactivo/no publicado y filtra orígenes. La política de dominios controla instalación, no autentica conversaciones.
- Protocolo visitante v2: capability HMAC de 90 días separada del ID, vinculada al workspace; nuevas conversaciones y handoffs. Recuperación mediante código privado, fuera de URLs. Compatibilidad v1 conservada para instalaciones antiguas; NO describir como migración de seguridad de todo el historial heredado.
- Bot transaccional/idempotente; transferencia de historial completo acotado, notificación única. Conocimiento limitado al workspace. Límites reales del cuerpo en plataforma y proxies ICC.
- Historial público de 100 mensajes por página, cursor comprobado dentro de la conversación; 205 mensajes con timestamp igual cubiertos sin pérdidas/duplicados.
- Oportunidades del propio workspace: creación/vínculo idempotentes y atribución inmutable. Informe 7/30/90 días, denominadores explícitos, oportunidad/venta única, monedas separadas y cancelaciones visibles; no confirma pagos bancarios. Panel global nuevo /admin/terraqo/atencion agrega sin textos/contactos.
- Pruebas PostgreSQL18 locales PASS: permisos, concurrencia, replay, privados, configuración, rollback, capability alterada/otra empresa/expirada, bot/handoff, paginación y métricas. La prueba detectó zona de sesión America/Bogota: corregido AT TIME ZONE UTC explícito en SQL crudo, sin cambiar zona global. Importes numéricos preservados como decimal, sin float financiero.
- TypeScript ambos repos y ESLint focalizado pasaron antes de últimos cambios de paginación/global; repetir cierre final. Capturas attention-detail-desktop.png, attention-config-desktop.png y customer-widget-current.png bajo ICC TOPOGRAFIA/output. Navegación móvil contexto-volver PASS; widget con API interceptada guardó capability y la reenvió después de recargar. No prueba HTTP autenticado remoto ni entrega de correo.
- Verificación Netlify actual: producción plataforma c623ec8e70d27c04babc3cb0ac6c594b00bc4cfc, deploy6ae7ec06e99b195a657aa8be; staging 2ece409ccc920c0da317f80b8a9a35c571c45dd7; ICC deploy6a7458e58755414196df9ea7 (sin commit_ref). No hubo despliegue de atención.

## Cierre pendiente actualizado
1. Aislar candidato de atención desde el commit realmente publicado c623ec8, sin S22 ni S23/S24. Aplicar únicamente parche propio de admin-actions (HEAD incluye guard S22 que no debe copiarse entero) y columnas seguimiento sobre schema de producción. Conservar working trees originales.
2. Completar validación HTTP real, transferencia obsoleta, recuperación navegador con resultado verificado y revisión de alcance visual; build del candidato y pruebas de regresión.
3. Instalación efectiva multiempresa/canales/automatizaciones: todavía no hay snippet genérico embebible ni prueba de instalación por una segunda empresa. Avisos externos y métricas de entrega/recuperación/costos no se han inventado: requieren eventos y canales conectados. Revisar alcance completo antes de considerar entrega final.
4. Preparar staging candidate con gate propio sin depender de migraciones S22/S23/S24 de la rama de desarrollo. Staging SQL seguimiento ya aplicado, no repetirlo.
5. Preparar backup y procedimiento productivo exacto (solo migración seguimiento), publicación de ambos sitios y comprobación. No se ha alterado producción.

Archivos ICC adicionales de esta continuación: app/components/ChatContinuity.tsx, app/api/terraqo/chat/config/route.ts, app/api/terraqo/chat/route.ts, app/api/terraqo/chatbot/route.ts, app/lib/terraqo-api.ts, app/lib/bounded-chat-body.ts. No incluir cambios Flutter ajenos.


## Estado vigente — candidato aislado de atención (2026-11-04)
Esta sección sustituye las listas antiguas de pendientes anteriores.

### Checkout de entrega
- Implementación más reciente: `C:/Users/Binv/Documents/New project/icc-topografia-attention-release`, rama `codex/customer-attention-release-20261104`.
- Base real publicada: `c623ec8e70d27c04babc3cb0ac6c594b00bc4cfc`. No incluye S22/S23/S24; no copiar schema ni admin-actions completos desde el checkout de desarrollo.
- El checkout original conserva S22 y versiones previas de algunos archivos de atención. Antes de seguir, trabajar en el candidato aislado; no asumir que el original contiene la última implementación.
- ICC mantiene únicamente los archivos web de atención modificados; preservar sus cambios Flutter ajenos.

### Últimos recorridos implementados
- Enlace público por empresa `/atencion/[workspaceSlug]`, disponible solo con configuración publicada, empresa activa y módulo habilitado. Configuración permite copiar/abrir ese enlace.
- Registro de resultado ganada/perdida desde una oportunidad vinculada, motivo obligatorio, auditoría privada visible, bloqueo de oportunidad y compare-and-set de estado. Reintento exacto conserva un recibo único; payload distinto o estado obsoleto se rechaza. No crea ventas ni pagos.
- Enlace desde el contexto a la oportunidad exacta y su cotización, filtrado por workspace en servidor.
- ICC usa logo/color publicado y contraste calculado. Recuperación dispone de CSS propio porque el sitio no carga las utilidades Tailwind del portal. Corregidos botones sin estilo, burbujas estiradas y scroll móvil.

### Evidencia nueva
- HTTP real contra Next.js local + PostgreSQL efímero: crear/reintentar, token ausente/alterado, aislamiento entre dos empresas, configuración publicada, origen rechazado, cuerpo chunked >40KB rechazado, derivación bot con capability. Ambas páginas públicas responden 200, empresa inexistente 404.
- PostgreSQL: transferencia válida y rechazo de transferencia obsoleta; resultado idempotente, rechazo sin permiso y sin motivo, rechazo de conflicto desde otra conversación; número de ventas inalterado.
- TypeScript plataforma/ICC PASS; encoding guard PASS; compilación completa Next PASS en dos ciclos. Existe advertencia heredada `admin-actions.ts:209 existingUserId` del commit base.
- Última compilación de cierre PASS después del enlace directo a oportunidades y del historial de resultados: sesión 73992, salida 0, 101 páginas generadas. PostgreSQL/HTTP PASS en el mismo ciclo.
- Playwright recuperación ICC PASS con API interceptada y datos sintéticos; mensaje de éxito comprobado. 390px sin overflow; botones 44px. Capturas `customer-recovery-polished.png` y `attention-outcome-desktop.png` en `ICC TOPOGRAFIA/output`.
- Formulario resultado validado visualmente con acción simulada; persistencia/concurrencia se valida separadamente en PostgreSQL. No confundir fixture visual con E2E autenticado remoto.
- Los builds realizados con la base sintética NO son artefactos desplegables.

### Respaldo productivo de solo lectura
- Backup privado: `C:/Users/Binv/.terraqo-private/attention-2026-11-04T11-21-04-208Z/icc.dump`.
- SHA256: `0078537b0bd9b0a36c78a37250a6fdb61913ef1c7a153062f614bd6a806a7a80`, 828064 bytes.
- Script `prepare-attention-production-backup.mjs --confirm=read-only-backup`: verifica sitio, commit publicado, host de DB, ledger y ausencia de columnas antes del dump; no imprime credenciales.
- Script `restore-attention-production-local.mjs <directorio> --confirm=local-restore-only`: restauración real local PASS; aplica exclusivamente SQL seguimiento, verifica hashes de datos de todas las tablas (columnas anteriores en ChatConversation) antes/después y rechazo de instalación duplicada. Ledger productivo no modificado.
- Dos intentos locales iniciales fallaron por CRLF en nombres emitidos por psql; corregido trim por línea y tercer intento PASS. No hubo escritura remota.

### Pendientes reales para publicar
1. Gate remoto del candidato de atención en staging y recorridos autenticados de administrador/asesor/visitante con cleanup demostrado. La configuración cloud vigente de staging corresponde a fases posteriores: preparar un gate coherente sin desactivar validaciones ni arrastrar migraciones S22/S23/S24.
2. Aislar y compilar candidato ICC desde fuente comprobada; el deploy publicado no informa commit_ref. No subir el árbol Flutter ni otros cambios locales.
3. Revisar el alcance de instalación y configuración: enlace público listo; snippet embebible genérico, posición/páginas del widget, campos por motivo, reglas automáticas de asignación/escalamiento y retención todavía no implementados. Equipo y cotizaciones se gestionan mediante los módulos existentes.
4. Avisos externos, adjuntos, estados de entrega verificables y medición de recuperación/fiabilidad no están completos. No prometer correo/WhatsApp ni inventar tasas/costos. Integración de pagos y mensajería bidireccional siguen como fase posterior explícita del documento.
5. Preparar migración productiva EXACTA con ledger y backup fresco/readback, rollback del código compatible con columnas aditivas; publicar ambos sitios y verificar dominios reales. Autorización del usuario para esta actualización ya existe; no volver a pedirla por rutina.
6. Aún NO se aplicó migración en producción ni se desplegó atención. No declarar 100% ni entrega publicada.


## Continuación: instalación web configurable — 2026-11-04
- Añadido `public/terraqo-attention.js`: botón flotante con Shadow DOM, contraste calculado, texto/posición/rutas desde la configuración publicada. Abre la atención en otra pestaña con noopener/noreferrer. No es un iframe ni un chat incrustado; la interfaz lo explica expresamente.
- Configuración incluye código copiable, posición izquierda/derecha, texto y rutas permitidas. Vacío permite todas las páginas; prefijos respetan límites de segmentos. Cambios siguen borrador/publicación/rollback. Configuraciones antiguas reciben defaults sin migración.
- CORS habilitado únicamente para configuración pública después de comprobar origen y publicación. Sin credenciales, sin habilitar CORS en historial privado. Dominios no autorizados: 403 sin cabecera permisiva.
- Navegación SPA revisa visibilidad sin sustituir history del sitio anfitrión. Previene instalaciones duplicadas y recupera el temporizador con pageshow/bfcache.
- Pruebas PostgreSQL/HTTP/Chrome reales PASS: compatibilidad de configuración anterior, rechazo de rutas ambiguas, origen permitido/rechazado, no exposición de historial, instalación duplicada, posición, móvil 390px, filtro al navegar y pestaña sin opener.
- Captura inspeccionada: `output/customer-attention-install-mobile.png` en candidato aislado.
- Build completo PASS (101 páginas), ESLint focalizado PASS, encoding PASS y diff check PASS. Primer build detectó sombreado TypeScript de history en el test; corregido con window.history y repetido el gate completo exitosamente. Artefactos sintéticos NO desplegables.
- Readback Netlify: producción plataforma y staging siguen exactamente los commits/deploys documentados; ICC sigue sin commit_ref. Ningún despliegue ni migración remota en esta continuación.

### Próximo bloque
- Preparar gate remoto de atención separado: el runner del candidato solo conoce b1-b3/b4/b5; no desactivar el plugin para pasar. Necesita identidad de candidato y pruebas autenticadas administrador/asesor con limpieza de fixtures.
- Avisos: Notification actual solo cubre bandeja interna, no tiene estados/reintentos de entrega. `sendTransactionalEmail` confirma aceptación del proveedor, no recepción. Implementar contacto verificado/opt-in transaccional, outbox persistente, worker idempotente y estados verificables antes de prometer avisos al visitante; no reutilizar Notification como prueba de email entregado.
- Siguen pendientes los restantes campos/reglas/retención/adjuntos del documento y publicación de ambos sitios. Este avance no equivale al alcance completo ni a lanzamiento.

## Continuación: autenticación real y gate de atención — 2026-11-04
- E2E real con Auth.js, PostgreSQL efímero y Chrome: asignación por administrador, respuesta y nota por asesor, aislamiento entre empresas, rechazo tras retirar asignación, revocación de membresía y contexto móvil sin overflow. Usuarios/conversaciones de prueba eliminados por IDs exactos.
- Corregido un fallo comprobado: React restablecía el formulario después de una acción rechazada y borraba el borrador. Respuesta y acciones usan submit explícito; solo se restablecen al confirmar éxito. E2E comprueba conservación de respuesta y nota rechazadas, sin escrituras.
- Nuevo gate cloud exclusivo de atención, sin ejecutar migraciones. Verifica sitio, rama, SHA, deploy servido, proyecto PostgreSQL, rol runtime, TLS, destinos públicos, correo desactivado y checksum de seguimiento; crea únicamente fixtures propios y comprueba limpieza.
- Tests de destino y plugin PASS; TypeScript PASS. Repetición completa PostgreSQL/HTTP/navegador PASS después del guard. SQL local conserva checksum a7f498f903d18ce459c2f12e32cb4dde3a36006e6a92480831f9b787ba8cde57.
- Readback inicial de staging: fase s23 y rama codex/platform-staging-release. Netlify devuelve secretos enmascarados: no tratarlos como URLs válidas ni reescribirlos. La comprobación final de secretos se realizará dentro del build cloud.
- Preparada publicación de candidato en staging con cambios limitados a tres variables no secretas y rama; respaldo de metadatos anterior en output. El resultado remoto debe registrarse por separado: este párrafo NO certifica un despliegue ni un gate remoto exitosos.
- Continúan pendientes los campos por motivo, reglas/retención/adjuntos, avisos externos verificables, aislamiento de release ICC y publicación productiva. S22 sigue pausado.

### Resultado del intento remoto
- Candidato `8ca0aed5afa0195d318b264bea5fda356884606d` publicado en la rama remota aislada. No es un deploy de plataforma.
- API Netlify permite actualizar la variable existente de fase, pero rechaza crear `ATTENTION_STAGING_CANDIDATE_SHA` con HTTP 403. Cambiar scopes o utilizar account_id no resolvió el rechazo. No continuar reintentando sin resolver acceso de creación de variables.
- La fase se restauró explícitamente a `s23` y se leyó de vuelta. Rama staging `codex/platform-staging-release`, deploy `6aea2a045ee12c88f761c44c` y secretos sin cambios. Producción continúa `6ae7ec06e99b195a657aa8be`. No se inició build ni se ejecutaron fixtures remotos.
- Script de intento y restauración en `output/publish-attention-staging.mjs` y `output/restore-attention-staging-phase.mjs`. Los snapshots de intentos repetidos pueden reflejar la fase transitoria customer-attention; el estado anterior y restaurado comprobado es s23.
- Para desbloquear: acceso Netlify que permita crear variables en el sitio staging exacto, o crear manualmente las dos variables nuevas con el SHA final revisado. Mantener secretos existentes. No eliminar ni saltar el gate.

### Configuración inicial por objetivo
- Implementados Vender / Atender / Agendar para empresas sin configuración guardada. Se ocultan después de elegir o guardar; no aparecen sobre una configuración vigente ni sobrescriben cambios del usuario.
- Solo modifican saludo y motivos. Preservan identidad, horario, privacidad, dominios y posición. Agendar solicita disponibilidad y deja explícita la confirmación del equipo; no finge una integración de calendario.
- Prueba unitaria PASS: schema, invariantes y ausencia de mutación. E2E autenticado PASS: elegir Agendar, guardar borrador, published=null, revision=1 y ausencia del selector inicial tras recargar. Vista móvil 390px inspeccionada, sin overflow; captura output/attention-objectives-mobile.png.
- Dos fallos iniciales de prueba corregidos: el fixture heredaba una configuración publicada del recorrido de instalación, y el label implícito del textarea incluía su contenido. Fixture inicial explícito y nombre accesible estable resuelven ambos. Repetición completa PostgreSQL/HTTP/Chrome PASS; fixtures y auditoría sintéticos eliminados por IDs propios.
- Pendientes de alcance y bloqueo remoto anteriores siguen vigentes. La selección de objetivos no sustituye los campos por motivo ni las reglas automáticas.

## Continuación: responsable inicial automático — 2026-11-04
- Nueva regla opcional por workspace: `routing.defaultProfileId`, valor inicial null compatible con configuraciones previas. Cambia solo al publicar; nunca se expone en la configuración pública del widget.
- Configuración muestra personas del mismo workspace con perfil activo/disponible, usuario con rol de atención y membresía administrativa activa. Guardar, publicar y restaurar vuelven a validar en servidor. No se conceden permisos ni se crean membresías automáticamente.
- Creación de consulta humana y derivación del asistente comparten la regla. La elegibilidad de usuario/perfil/membresía se mantiene con bloqueos compartidos hasta el commit. Mantiene estado WAITING; asignación no equivale a respuesta.
- Destinatario revocado, desconectado o sin rol: la consulta se conserva en bandeja sin asignar y se registra auditoría privada para revisión. No se reasigna historial ni se pisan transferencias manuales. Reintentos retornan su recibo existente, sin repetir asignación ni auditoría.
- PostgreSQL real PASS: borrador no aplicado, perfil ajeno rechazado, concurrencia/idempotencia, conservación de responsable manual, handoff del bot, perfil OFFLINE, rol CUSTOMER, membresía revocada y rechazo de rollback hacia destinatario no válido. Fixtures propios eliminados.
- E2E autenticado PASS: selector de responsable, guardar, publicar, creación HTTP pública y asignación persistida. DTO público sin routing. Capturas `output/attention-routing-mobile.png` y `output/attention-routing-desktop.png` revisadas; continuidad de interfaz existente. TypeScript, ESLint y detector visual PASS.
- Esto cubre la regla de responsable inicial; distribución por motivo, plazos/escalamiento, campos por motivo, retención, adjuntos y avisos externos siguen pendientes. No requiere migración adicional.
- Readback remoto sin mutaciones: staging sigue fase s23 / deploy 6aea2a045ee12c88f761c44c. Bloqueo de creación de variables 403 no resuelto; no reintentar sin cambio de acceso. No hubo migraciones ni despliegues remotos en esta fase.
- Cierre: build completo Next PASS, 101 páginas, salida 0 (sesión 37083). Advertencia heredada existingUserId en admin-actions.ts:209. Artefactos de base sintética NO desplegables. Próximo bloque independiente: datos solicitados por motivo; gate remoto requiere resolver el permiso de creación de variables.

## Gate remoto desbloqueado y regresión de acceso — 2026-11-04
- El usuario creó las variables requeridas. Staging quedó en rama codex/customer-attention-release-20261104 y fase customer-attention. El bloqueo 403 anterior ya no está vigente.
- Último candidato remoto: bb2e2615f8d612c3f42542976243709d96f4bcaf, deploy 6aeb23c46204755403aa9f69. Build ready NO equivale a gate aprobado: el plugin falló en revocation por el bucle cuenta/admin de una membresía revocada.
- Checksum resuelto sin modificar SQL ni ledger: se reconoce el artefacto histórico exacto de saltos mixtos únicamente cuando el contenido normalizado coincide. Test de checksum y contrato staging PASS.
- Corrección local: /cuenta comprueba membresía activa antes de redirigir a administración; muestra acceso inactivo y permite volver a comprobar. Los ensayos reales llegaron a esa pantalla, sin contenido privado y sin overflow móvil.
- Test reforzado para exigir mismo origen, navegación completa y cierre efectivo de sesión. Tres ensayos locales de esta continuación no cerraron el gate: dos timeouts esperando login y el último confirmó que /api/auth/session aún devuelve user después del botón Cerrar sesión. No retirar esa aserción ni aprobar el candidato. Investigar petición signout/CSRF/cookies y posibles respuestas concurrentes antes de otro ciclo de corrección; causa todavía no confirmada.
- TypeScript PASS (sesión 59319), ESLint focalizado PASS, diff check PASS. Primera ejecución TypeScript colisionó con regeneración .next del ensayo; repetida de forma secuencial con salida 0. Base local efímera detenida por finally; no conexiones remotas en esos ensayos.
- Runner/plugin incorporan diagnóstico estructural attentionCleanup:verified solo tras comprobar ausencia de workspaces sintéticos. Cambio todavía local, no ejecutado en cloud.
- No commit/push/deploy nuevo ni migración productiva en esta continuación. Estos cambios locales NO están aprobados para publicar. Siguiente bloque independiente: campos solicitados por motivo. El lanzamiento sigue condicionado al cierre de sesión, gate remoto completo y restantes pendientes de alcance/ICC ya enumerados.

### Recuperación de acceso cerrada localmente
- Sustituido el botón cliente de la pantalla de membresía revocada por formulario con Server Action y signOut de Auth.js. Funciona sin depender de hidratación; conserva revocación del grant CV y eliminación de cookie mediante el mecanismo existente. No se modificó el botón global ni la política de permisos.
- Reproducción anterior conservaba user después de salir. Con el formulario servidor, /api/auth/session devuelve null y aparece el formulario de acceso. El test exige HTTP 200 y ausencia de user, admite null como respuesta válida y comprueba navegación de mismo origen. No se debilitó la comprobación de autenticación.
- Ensayo completo local PASS (sesión 61868): PostgreSQL efímero, HTTP real, Chrome, asignación automática/manual, concurrencia/idempotencia, aislamiento, notas, permisos obsoletos, conservación de borradores, revocación y cierre de sesión. Fixtures eliminados por IDs propios; cluster detenido. Captura móvil de salida revisada.
- Contrato staging, checksums y ESLint focalizado PASS. Diagnósticos temporales de cookies/red retirados del test. Pendiente registrar gate remoto del nuevo candidato; producción sigue sin actualización.

### Staging aprobado — candidato 035642e
- TypeScript secuencial PASS (sesión 61999). Commit 035642e00399bac5a7c23027b5a443f6e037bb4a publicado en rama aislada.
- Build manual 6aeb7cc475ddf19e3cb32383, deploy 6aeb7cc475ddf19e3cb32385: ready. Plugin /plugins/terraqo-staging-gate, evento onSuccess, estado success, resumen PASS customer-attention con el mismo commit y deploy. El gate exige ejecución autenticada, identidad exacta del candidato al inicio/final y limpieza; todos pasaron.
- Marcador público leído mediante HTTP 200 coincide con sitio, commit y deploy. El build automático previo 6aeb7cb1f6908f88e3fb3d32 falló antes del build por SHA de entorno anterior; no es el candidato aprobado ni se omitió su guard.
- Bloqueo de membresía revocada y salida cerrado en staging. No implica alcance completo ni publicación productiva. Próximos bloques: campos por motivo, reglas/plazos/retención, avisos externos y adjuntos; aislamiento de candidato ICC y preparación/publicación productiva pendiente.

## Datos de contacto por motivo — 2026-11-04
- Añadidas reglas publicables por motivo para correo/teléfono: opcional, obligatorio o no solicitar. Configuraciones anteriores reciben contactRules=[]; no requiere migración. Reglas duplicadas o para motivos inexistentes se rechazan. Cambiar un motivo descarta su regla anterior, con aviso para revisarla.
- Configuración inline sin modales; formulario visitante muestra etiquetas permanentes, requisito explícito y solo los campos solicitados. Los datos usan customerEmail/customerPhone existentes y quedan disponibles en contexto autorizado de la bandeja; no se añaden al DTO público de historial.
- Servidor valida la política publicada dentro del bloqueo de workspace, después del recibo idempotente. El borrador no afecta consultas; publicar una política distinta no invalida reintentos anteriores ni impide continuar conversaciones existentes. Rechaza motivo ausente/desconocido, contacto obligatorio vacío y contacto oculto enviado manualmente antes de escribir.
- Alcance exacto: correo/teléfono al iniciar consulta directa. Campos personalizados, captura progresiva posterior, verificación del contacto, avisos y validación de datos en derivaciones del bot siguen pendientes. La UI no promete activar email, WhatsApp ni publicidad.
- Ensayo PostgreSQL/HTTP/Chrome completo PASS (sesión 60615): publicar desde UI, formulario móvil, envío real, almacenamiento, rechazo HTTP 422, aislamiento y limpieza de fixtures. Pruebas de concurrencia/idempotencia, replay tras publicar, rechazo sin escrituras y continuidad PASS. Capturas attention-contact-settings-mobile.png y attention-contact-visitor-mobile.png inspeccionadas; no overflow a 390 px. Detector Impeccable sin hallazgos; ESLint focalizado PASS.
- Primer ensayo detectó nombre accesible ambiguo del select; añadido aria-label. Segundo detectó que request-origin convertía loopback 127.0.0.1 en HTTPS sin puerto. Corregido únicamente en desarrollo y para host permitido; test-request-origin confirma que producción no recibe la excepción HTTP y hosts no configurados conservan fallback. Tercer ensayo completo PASS. No se omitió control de origen.
- Producción sin cambios. Nuevo gate remoto aún pendiente; aprobación previa 035642e corresponde al bloque anterior.

### Gate remoto de datos de contacto aprobado
- Commit 7fd93162782f4cf60aea24af9453b04617fb46f5, build 6aeb81a9e3dff1e20855e249, deploy staging 6aeb81a9e3dff1e20855e24b. Compilación ready; plugin onSuccess success con resumen PASS customer-attention y el mismo SHA/deploy. Marcador público HTTP 200 coincide.
- TypeScript PASS (sesión 43284); ESLint, objetivos y request-origin PASS. El recorrido remoto incluye publicación de reglas, formulario visitante, rechazo HTTP 422 sin contacto requerido, envío HTTP 201 con correo y teléfono nulo, además de los recorridos previos.
- Comprobación independiente de solo lectura por Supabase MCP: proyecto mghdpciewbsowjrjwmwk confirmado como Terraqo Platform Staging, ACTIVE_HEALTHY. No existen workspaces attentiongate-% creados en la última hora tras completar el gate. No mutaciones por MCP.
- El build automático anterior 6aeb819b943458a995eec5e2 rechazó SHA de entorno anterior; no se confunde con el manual aprobado. No despliegue ni migración productiva. Siguiente bloque: captura progresiva/campos adicionales y resto de pendientes explícitos; conservar separación del candidato ICC.

## Contacto progresivo dentro de la conversación — 2026-11-04
- Nuevo formulario inline desplegable para compartir correo/teléfono después de iniciar una consulta. Conserva historial, destinatario y estado; campos omitidos no borran los existentes. Respeta campos ocultos del motivo publicado. No activa notificaciones externas, consentimiento comercial ni verificación de titularidad.
- POST /api/chat/contact exige capability firmada del workspace/conversación para TODOS los IDs (sin excepción legacy), antes de consumir JSON; límite real 2048 bytes y schema estricto. Sin nuevo endpoint de lectura de contacto ni exposición de correo/teléfono en historial público.
- Operación serializada con bloqueo compartido de workspace y exclusivo de conversación, en ese orden. Recibo determinista en ActivityLog y fingerprint para reintentos/conflictos. Auditoría conserva nombres de campos y fingerprint, no sus valores. Reintento confirmado no vuelve a escribir ni reabre una consulta cerrada. Nuevos cambios sobre consulta cerrada: 409; límite cinco actualizaciones/minuto por conversación.
- PostgreSQL/HTTP/Chrome completo PASS (sesión 67714): capability ausente/alterada y otra empresa rechazadas; JSON desconocido/vacío rechazado; stream sobredimensionado 413; concurrencia crea un recibo, cambio de payload 409, actualización parcial conserva el otro dato, historial sin contactos, cierre protegido. E2E móvil comprueba datos ocultos, offline conserva borrador y reintento único exitoso. Fixtures eliminados; cluster local detenido.
- TypeScript PASS (sesión 85070), ESLint focalizado PASS, detector Impeccable sin hallazgos. Captura attention-progressive-contact-mobile.png inspeccionada a 390 px, sin overflow. No migración requerida ni mutación productiva.
- Alcance restante: campos personalizados y su solicitud por etapas, verificación/avisos externos, reglas y retención, adjuntos, candidato ICC y publicación final. Esta fase comparte datos; no prueba ni promete entrega de mensajes por otro canal.

### Gate remoto de contacto progresivo aprobado
- Candidato 9012e06da0ab16e04acf818da1950961ee1512fb; build 6aeb856bb6297fe239ae8077; deploy 6aeb856bb6297fe239ae8079. Plugin onSuccess success, PASS customer-attention para el mismo SHA/deploy. Marcador público HTTP 200 coincide.
- Supabase MCP, consulta independiente de solo lectura: cero workspaces attentiongate-% creados en la última hora tras el gate. Fixtures limpiados.
- Producción plataforma sigue 6ae7ec06e99b195a657aa8be; ICC sigue 6a7458e58755414196df9ea7. Verificado por API Netlify; no actualización productiva en esta fase.
- Preparado worktree ICC C:/Users/Binv/Documents/icc-attention-release, rama codex/icc-attention-release-20261104, base 3b66f56. Nueve archivos del chat copiados con comprobación SHA256; trabajo móvil original intacto. npm ci y build:next PASS, 69 páginas. Nota detallada docs/attention-release-2026-11-04.md en ese worktree.
- Siguiente bloque: integrar contacto por motivo/progresivo en candidato ICC y pruebas de proxy/continuidad/UX. Antes de desplegar, confirmar paridad del sitio ICC publicado (commit_ref null). Siguen pendientes campos personalizados, avisos externos, reglas/retención y adjuntos; aprobación de esta fase no equivale a lanzamiento completo.

### Candidato ICC integrado localmente — ecf4c8d
- Worktree C:/Users/Binv/Documents/icc-attention-release, rama codex/icc-attention-release-20261104. Commit local ecf4c8d con continuidad, configuración por motivo, contacto progresivo y proxy acotado. Sin push/deploy; checkout móvil preservado.
- TypeScript y build Next PASS (70 páginas), pruebas HTTP/navegador sintéticas PASS, offline conserva borrador y reintento confirma envío. Revisión visual móvil/escritorio y detector Impeccable sin hallazgos. Handoff detallado docs/attention-release-2026-11-04.md en ese worktree.
- Pendiente concreto: recorrido ICC al backend staging con fixture aislado; paridad del sitio ICC publicado, cuyo deploy tiene commit_ref null. No confundir prueba sintética del proxy con persistencia/validación real del backend. Candidato plataforma aprobado sigue 9012e06.

## Publicación de atención completada — 2026-11-04
Esta sección sustituye el estado anterior de producción sin cambios. El usuario indicó continuar sin nuevas confirmaciones hasta desplegar.

### Identidades publicadas
- Plataforma: sitio 2d38524a-44f9-4473-8a1f-9270e03bc2bf, commit 9012e06da0ab16e04acf818da1950961ee1512fb, build 6aeb8b63e9b70e319e507e71, deploy 6aeb8b63e9b70e319e507e73 ready. Rama codex/icc-production-preview avanzó por fast-forward desde c623ec8, sin S22. Sin modificar variables productivas.
- ICC: sitio 5e1adf1c-580a-46e3-8854-e6a795cc7c73, commit fuente 31a3e1103b4766fc379657128e6028d7e2f72079, deploy 6aeb8d271c577caa292450a9 ready/publicado. Rama codex/icc-attention-release-20261104 enviada a origen. Publicación del mismo artefacto que pasó smoke de preview.

### Base de datos y reversión
- Backup fresco privado C:/Users/Binv/.terraqo-private/attention-2026-11-04T19-38-59-965Z/icc.dump, SHA256 16ea0072c6bced230ea0355f452f47e33a7fb2ce1270e049efedc4e75ecb0854, 828062 bytes. Restauración PostgreSQL18 y ensayo de migración PASS, hashes de filas preservados.
- Aplicada únicamente 20261104000200_customer_attention_followup en producción, 2026-11-04T19:45:23Z; checksum a7f498f903d18ce459c2f12e32cb4dde3a36006e6a92480831f9b787ba8cde57. Ledger idéntico al respaldo antes de mutar; transacción y lock_timeout 5s. Tres columnas nullable y un índice, ledger escrito en la misma transacción. Sin cambios a filas de clientes ni pagos.
- Rollback de código: plataforma deploy 6ae7ec06e99b195a657aa8be; ICC deploy 6a7458e58755414196df9ea7. Conservar columnas aditivas al revertir código; no eliminar datos ni restaurar backup encima de actividad nueva por rutina.

### Validación de integración y publicación
- ICC local hacia backend staging real: workspace sintético attention-icc-release-20261104, inicio de consulta, actualización progresiva de email, teléfono oculto y recuperación tras recargar PASS. Readback SQL confirma contacto actualizado, estado WAITING, un mensaje. Fixture y auditoría/notificaciones propias eliminados; remaining=0.
- Prueba sintética ampliada para configuración legacy publicada=null PASS. Componente espera respuesta de configuración y mantiene contacto progresivo opcional para empresas legacy.
- ICC empaquetado con CLI local fijado 26.0.1, build --offline; proceso de build sin token ni secretos de DB/Auth, solo variables públicas permitidas. Runtime Next Netlify 5.16.6. Compilación/TypeScript PASS, 70 páginas.
- Paridad ICC: contenido main de /, /contacto, /servicios, /tienda, /nosotros, /checkout y /cuenta coincide exactamente con producción anterior, HTTP200. 55 assets idénticos por SHA1, dos SVG equivalentes tras normalizar saltos de línea. No equivalencia byte a byte del bundle (compilación diferente); commit_ref previo era null.
- Dos drafts ICC incorrectos por publishDir .next no cargaban CSS/JS: no llegaron a producción. Corregido a .netlify/static del adaptador; nuevo preview pasó y ambos drafts rechazados fueron eliminados por ID después de publicar. No se borraron deploys de rollback.
- Smoke ICC preview y dominio real: config200, contacto sin token401, apertura chat/formulario móvil390px, sin overflow horizontal ni pageerror. Cero mensajes reales enviados. Capturas output/icc-draft-mobile.png y output/icc-live-mobile.png.
- Plataforma real: terraqoglobal.com200, portal.terraqoglobal.com/cuenta200, admin.terraqoglobal.com/admin/chat307 al acceso, api.terraqoglobal.com/api/chat/config200. E2E autenticado certificado en staging del mismo SHA; no se entró a una cuenta cliente real durante smoke productivo.
- Evidencia resumida output/attention-production-release.json y output/attention-production-migration.json. Handoffs y cambios ajenos originales preservados.

### Alcance y pendientes no ocultados
Publicado: bandeja, asignación/transferencia, notas privadas, seguimiento, configuración por workspace, instalación/enlace, continuidad/recuperación, contacto por motivo/progresivo, vínculo y resultados comerciales, métricas existentes. Cada empresa publica sus propias reglas; no se sobrescribieron configuraciones de clientes.
Pendientes del documento completo: campos personalizados, adjuntos, avisos externos con verificación/outbox/entrega, escalamiento/retención y automatizaciones avanzadas. No afirmar 100% del documento ni prometer correo/WhatsApp. Pagos y mensajería bidireccional siguen fase posterior. S22 permanece pausado.

## Continuidad mediante enlace privado
Sustituido código JSON visible por Copiar enlace privado y Compartir nativo. Fragmento retirado antes de recuperar; no viaja en URL HTTP. Apertura automática en contexto nuevo y compatibilidad JSON anterior. Sin migraciones ni uso de credenciales reales. Harness PostgreSQL local completo PASS: permisos, tenants, idempotencia, contactos y recuperación Chromium móvil. Primera prueba detectó falta de role log en historial; corregida semántica accesible y repetición completa PASS. TypeScript y pruebas parser PASS. Captura output/attention-recovery-link-mobile.png revisada.
